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

import { shuffleArray } from '../util.js'
export default GossipAlgorithm

/**
 * A gossip peer implements function allowing communication with other peers on
 * an unstructured network.
 *
 * @interface GossipAlgorithm
 * @param {string} id - id of the peer
 * @param {Object} options - values used to tune the algorithm
 *
 * @property {string} id - id of the peer
 * @property {Object} options - values used to tune the algorithm
 * @property {NodeDescriptor} selfDescriptor - Descriptor of the node
 */
function GossipAlgorithm(id, options) {
  this.id = id
  this.options = options
  this.selfDescriptor = { id: id, age: 0 }
}

/**
 * Generates a subset of the view for a remote peer
 *
 * @function GossipAlgorithm#genBuffer
 * @return {View} A set of NodeDescriptor which will be sent to a remote peer
 */
GossipAlgorithm.prototype.genBuffer = function() {}

/**
 * Merges the NodeDescriptors received from a remote peer with the View
 *
 * @function GossipAlgorithm#mergeView
 * @return {View} The updated view
 */
GossipAlgorithm.prototype.mergeView = function() {}

/**
 * Returns a subset of the view. The elements are picked at random. If the
 * desired size is bigger than the size of the initial view, the whole view will
 * be returned.
 *
 * @function GossipAlgorithm#randomSubview
 * @param {number} size - How many elements should be returned
 * @param {View} view - Initial view
 * @return {View} A possibly smaller view composed of randomly chosen
 *         elements from the `view` parameter
 */
GossipAlgorithm.prototype.randomSubview = function(size, view) {
  return shuffleArray(view).slice(0, size)
}

/**
 * Returns the oldest node descriptor contained in the view
 *
 * @function GossipAlgorithm#getOldestNodeDescriptor
 * @param {View} view
 * @return {NodeDescriptor} oldest node descriptor of the view
 */
GossipAlgorithm.prototype.getOldestNodeDescriptor = function(view) {
  return view.reduce(((acc, val) => acc.age > val.age ? acc : val), { age: 0 })
}

/**
 * Increment age from every node descriptor of the given view.
 * The change is made in place otherwise we would need a deep copy of the array.
 *
 * @function GossipAlgorithm#increaseAge
 * @param {View} view - View to age
 * @return {View} The same view with every NodeDescriptor one unit older
 */
GossipAlgorithm.prototype.increaseAge = function(view) {
  view.forEach(nodeDescriptor => nodeDescriptor.age += 1)
  return view
}

/**
 * Get the node descriptor of a known remote peer
 *
 * @function GossipAlgorithm#selectRemotePeer
 * @param {string} method - How the remote peer should be selected. Possible
 *        values are `oldest` and `random`
 * @param {View} view - Where the descriptor should be get from
 * @return {NodeDescriptor} Descriptor of the selected remote peer
 */
GossipAlgorithm.prototype.selectRemotePeer = function(method, view) {
  if(method === 'oldest') {
    return this.getOldestNodeDescriptor(view).id
  } else if(method === 'random') {
    return view[Math.floor(Math.random() * view.length)].id
  } else {
    throw new Error('Unknown selection method')
  }
}
