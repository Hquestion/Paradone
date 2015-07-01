/*
 * Copyright 2015 Paradone
 *
 * This file is part of Paradone <https://paradone.github.io>
 *
 * Paradone is free software: you can redistribute it and/or modify it under
 * the terms of the GNU Affero General Public License as published by the
 * Free Software Foundation, either version 3 of the License, or (at your
 * option) any later version.
 *
 * Paradone is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
 * FITNESS FOR A PARTICULAR PURPOSE.  See the GNU Affero General Public
 * License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with Paradone.  If not, see <http://www.gnu.org/licenses/>.
 *
 * @flow
 */

import GossipAlgorithm from './gossipAlgo.js'
import { shuffleArray } from '../util.js'
import { difference, merge, union, findIndex, propEq } from 'ramda'
export default GossipRPS

/**
 * Implementation of the `Random Peer Sampling` gossiping algorithm. The peer
 * will repeat the same step where it sends an extract of its current view to a
 * remote peer (often chosen at random) and will expect the remote peer to send
 * an extract back. A new view fr the peer is the, computed depending on the
 * current view and the descriptors that were sent and received.
 *
 * @class GossipRPS
 * @implements GossipAlgorithm
 * @param {String} id - Id of the peer
 * @param {Object} options - Algorithm options
 * @param {number} [options.C=10] - Maximum size of the view
 * @param {number} [options.H=0] - Healing factor: How many of the oldest nodes
 *        are removed during an exchange
 * @param {number} [options.S=0] - Swap factor: How many of the exchanged
 *        descriptors are removed from the view
 *
 * @property {String} id - Id of the peer
 * @property {Object} options - Algorithm options
 */
function GossipRPS(id, options) {
  GossipAlgorithm.call(this, id, options)
  this.id = id
  this.options = merge({C: 10, H: 0, S: 0}, options)
}

GossipRPS.prototype = Object.create(GossipAlgorithm.prototype)

/**
 * Generates a subset of the view. The returned view will not contain any
 * descriptor about the remote peer. If the view is asked by the 'active' thread
 * the descriptor of the node will be inserted in the returned view subset.
 *
 * @function GossipRPS#genBuffer
 * @param {string} thread - Generation for the active or passive thread
 * @param {string} distantId - The id that should be excluded from the extract
 * @param {View} view - The base view from which the subset is generated
 * @return {View} A subset of the view
 */
GossipRPS.prototype.genBuffer = function(thread, distantId, view) {

  const defaultBufferSize = this.options.C / 2
  const H = this.options.H

  var computeBuffer = bufferSize => {
    view = view.filter(elmt => elmt.id !== distantId)

    if(view.length < bufferSize) {
      // Don't have enough elements in the view yet
      return view
    } else {
      // Compute new view from extract
      view = view.sort((a, b) => a.age - b.age)
      var head = view.slice(0, -H)
      var tail = view.slice(-H)

      if(bufferSize < head.length) {
        // subview contained in head only
        return this.randomSubview(bufferSize, head)
      } else if(bufferSize === head.length) {
        // subview is head
        return head
      } else {
        // subview is head and some elements of tail
        return union(head, this.randomSubview(bufferSize - head.length, tail))
      }
    }
  }

  if(thread === 'active') {
    let result = computeBuffer(defaultBufferSize - 1)
    result.push(this.selfDescriptor)
    return result
  } else {
    return computeBuffer(defaultBufferSize)
  }
}

/**
 * Create a new view result of the merge from the current view and the subset
 * transmitted by the remote peer. The heal factor is used to remove older
 * nodes and the swap factor to remove nodes sent back as a response to the
 * remote. The final view will have at most C elements
 *
 * @function GossipRPS#mergeView
 * @param {View} recvBuffer - Subset of a view transmitted by the remote peer
 * @param {View} sentBuffer - IDs of the descriptors sent to the
 *        remote peer
 * @param {View} view - View to be used as a base for merging
 * @return {View} The merged view of size C
 */
GossipRPS.prototype.mergeView = function(recvBuffer, sentBuffer, view) {
  const H = this.options.H
  const C = this.options.C
  const S = this.options.S

  // Merge view and remote buffer. If a descriptor is already in the view, we
  // keep the younger one
  recvBuffer.forEach(descriptor => {
    if(descriptor.id === this.id) {
      return // Does not need to add own descriptor to own view
    }

    var id = findIndex(propEq('id', descriptor.id), view)
    if(id === -1) {
      view.push(descriptor)
    } else if(descriptor.age < view[id].age) {
      view[id] = descriptor
    }
  })

  // We need to remove the extra keys so we sort the view by descriptor's age
  // and remove the last few
  let numberToRemove = Math.min(H, Math.max(0, view.length - C))
  view = view.sort((a, b) => a.age - b.age)
    .slice(0, view.length - numberToRemove)

  // The we get all swapped elements we want to remove
  numberToRemove = Math.min(S, Math.max(0, view.length - C))
  let swapped = shuffleArray(sentBuffer).slice(0, numberToRemove)
  // Remove every elements of `swapped` present in `view`
  view = difference(view, swapped)

  // If the view is still too large we just remove some random descriptors
  if(view.length > C) {
    // Be sure not to slice with negative numbers!
    view = shuffleArray(view).slice(view.length - C)
  }

  return view
}
