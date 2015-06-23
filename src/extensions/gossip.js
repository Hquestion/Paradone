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
'use strict'

import {meanArray} from '../util.js'
export default Gossip

/**
 * @typedef View
 * @desc A list of NodeDescriptors
 * @type {Array.<NodeDescriptor>}
 */

/**
 * @typedef NodeDescriptor
 * @desc Object containing information about a peer. This information should be
 *       enough to allow any peer possessing the descriptor to establish a
 *       connection of the described peer (in our case we use the id to find the
 *       node). Extensions can add properties to the NodeDescriptor's instance
 *       with `gossip:descriptor-update` messages.
 * @type {Object}
 * @property {string} id - Id of the remote peer
 * @property {number} age - For how long the node has been in the view
 */

/**
 * Implementation of a gossip protocol for unstructured P2P network
 *
 * @mixin Gossip
 * @extends Peer
 * @param {Object} options
 * @property {View} view - List of known peers
 * @property {Worker} worker - Web worker used to process messages behind the
 *           scenes
 */
function Gossip(options) {
  this.bandwidths = []
  this.worker = new Worker('./gossipWorker.js')
  this.worker.addEventListener('message', evt => {
    let message = evt.data
    if(message.to === this.id) {
      this.dispatchMessage(message)
    } else {
      this.send(message)
    }
  })

  /**
   * @return {number} The number of connections the peer should have for a
   *         correct distribution of the data on the network
   */
  this.getMaxConnections = function() {
    const meanfanout = Math.log(this.view.length)
    const bw = meanArray(this.bandwidths)
    let meanbw = meanArray(
      this.view
        .filter(nd => typeof nd.media !== 'undefined' &&
                      typeof nd.media.bandwidth !== 'undefined')
        .map(nd => nd.media.bandwidth))

    return isNaN(meanbw) ? meanfanout : meanfanout * bw / meanbw
  }

  // Worker#postMessage doesn't seem to be a valid listener, we need to wrap it
  let dispatch = msg => this.worker.postMessage(msg)
  this
    .on('first-view', dispatch)
    .on('gossip:request-exchange', dispatch)
    .on('gossip:answer-request', dispatch)
    .on('gossip:descriptor-update', dispatch)

  this.on('gossip:bandwidth', msg => {
    this.bandwidths.push(msg.data)
    msg.type = 'gossip:descriptor-update'
    msg.data = {
      path: ['media', 'bandwidth'],
      value: meanArray(this.bandwidths)
    }
    dispatch(msg)
  })

  // Messages from the Web Worker
  this.on('gossip:view-update', msg => this.view = msg.data)

  // Initialization of the Web Worker
  this.worker.postMessage({
    type: 'gossip:init',
    from: 'self',
    to: 'self',
    data: options
  })
}
