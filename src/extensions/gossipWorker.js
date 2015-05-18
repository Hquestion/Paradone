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

import MessageEmitter from '../messageEmitter.js'
import Algo from './gossipRPS.js'
import { assocPath } from 'ramda'

export default GossipWorker

/**
 * Sends the view to the main thread
 */
var updateOutsideView = function() {
  this.send({
    type: 'gossip:view-update',
    from: this.id,
    to: this.id,
    data: this.view
  })
}

/**
 * Active exchange of views with a selected peers. We have to select one peer
 * (oldest or randomly), generate a view for this remote peer, send the view,
 * wait for the answer and finally generate a new merged view.
 */
var activeThread = function() {
  var view = this.view

  if(view.length === 0) {
    return
  }
  // TODO Replace with a contact bucket
  var distantId = this.algo.selectRemotePeer('random', view)
  var sentBuffer = this.algo.genBuffer('active', distantId, view)
  this.on('gossip:answer-exchange', function callback(message) {
    // TODO Depends on push/pull policy
    /* The catch here is concurrent update of the view elements. The algorithm
     * states that the view should be reordered each time a new buffer is
     * generated: Swapped nodes at the beginning, oldest nodes at the end and
     * the rest randomly in between. This allows for simple and efficient view
     * pruning (the size of the view must be constant).
     *
     * If the node receives a request from an other distant node while waiting
     * for this callback to be called, the view will be updated with the value
     * of the other received buffer and the "swapped nodes" located at the
     * beginning of the view will not be the swapped nodes of the exchange
     * happening in this particular callback.
     *
     * The oldest nodes present in the view can be categorised and removed
     * independently of the sent and received buffers. The "problem" is only
     * for swapped nodes.
     *
     * The tricky bits are done in the `mergeView` function.
     */
    if(message.from === distantId) {
      // Generate the new view
      view = this.algo.mergeView(message.data, sentBuffer, this.view)
      // The exchange is complete the view gets older and is saved
      this.view = this.algo.increaseAge(view)
      // We don't need this callback anymore
      this.removeListener('gossip:answer-exchange', callback)
      // DEBUG Update the view outside
      updateOutsideView.call(this)
    }
  }.bind(this))
  // Don't forget to send the generated extract to the selected peer
  this.send({
    type: 'gossip:request-exchange',
    from: this.id,
    to: distantId,
    data: sentBuffer,
    ttl: 3,
    forwardBy: []
  })
}

/**
 * Reception of the remote's view subset. We generate an extract to return to
 * the remote peer and merge everything with the view.
 *
 * @param {Message} message
 */
var passiveThread = function(message) {
  var sentBuffer = this.algo.genBuffer('passive', message.from, this.view)
  this.view = this.algo.increaseAge(
    this.algo.mergeView(message.data, sentBuffer, this.view))
  this.send({
    type: 'gossip:answer-exchange',
    from: this.id,
    to: message.from,
    data: sentBuffer,
    ttl: 0,
    forwardBy: []
  })
  updateOutsideView.call(this)
}

/**
 * Sets the algorithm's options
 *
 * @param {Message} message
 * @param {number} [message.data.gossipPeriod=2500] - Interval in milliseconds
 *        between two active requests
 */
var oninit = function(message) {
  let parameters = message.data
  this.options = parameters

  if(parameters.hasOwnProperty('gossipPeriod')) {
    this.gossipPeriod = parameters.gossipPeriod
  } else {
    this.gossipPeriod = 2500
  }
}

/**
 * Starts the active thread of the algorithm
 *
 * @param {Message} message
 */
var onfirstview = function(message) {
  this.id = message.data.id
  this.view = message.data.view
  this.algo = new Algo(this.id, this.options)
  self.setInterval(activeThread.bind(this), this.gossipPeriod)
}

/**
 * Updates the node's descriptor. This can be used by extensions to convey
 * information about the peer to other remote peers through view exchange.
 *
 * @param {Message} message
 * @param {Array.<string>} message.data.path - Path of properties in the
 *        descriptor object where the value will be set or updated. The first
 *        element of the array (index 0) should be the name of the extension
 *        requesting the descriptor update. If a property of the path does not
 *        exist in the descriptor it will *not* be created and the update will
 *        fail.
 * @param {any} message.data.value - Value to be added at the end of the path
 */
var ondescriptorupdate = function(message) {
  this.algo.selfDescriptor = assocPath(
    message.data.path, message.data.value, this.algo.selfDescriptor)
}

/**
 * A gossip worker is a class that should be run in a web Worker. The file
 * containing the class has the necessary code to instantiate itself. The
 * computations will be started as soon as the `first-view` message is received.
 * The data returned by the `message` events will be formated as a `Message`
 * object.
 *
 * @example
 * // Start a Gossip Worker
 * var gworker = new Worker('gossipWorker.js')
 * gworker.addEventListener('message', evt => {
 *   var message = evt.data /// @type {Message}
 *   dispatchMessage(message) // Do something with the message
 * })
 * // Set algorithm options
 * gworker.postMessage({type: 'gossip:init', ..., data: options})
 * // Start the algorithm
 * gworker.postMessage({type: 'first-view', ..., data: first-view})
 *
 * @class GossipWorker
 * @property {View} view - Current view of the peer
 * @property {GossipAlgorithm} algo - Gossip algorithm used to compute the new
 *           view and share node descriptors with other peers.
 * @property {number} gossipPeriod - How often, in milliseconds, the active
 *           thread of the gossip algorithm should be executed
 */
function GossipWorker() {
  MessageEmitter.call(this)
  this.view = []

  // Initialisation options
  this.once('gossip:init', oninit.bind(this))
  // As soon as the first view is received, start the active thread
  this.once('first-view', onfirstview.bind(this))
  // Request from the peer to update its descriptor
  this.on('gossip:descriptor-update', ondescriptorupdate.bind(this))
  // Partial view request from a remote peer
  this.on('gossip:request-exchange', passiveThread.bind(this))
}

GossipWorker.prototype = Object.create(MessageEmitter.prototype)

/**
 * Sends the message to the outside world
 *
 * @function GossipWorker#send
 * @param {Message} message - Message to send
 */
GossipWorker.prototype.send = function(message) {
  self.postMessage(message)
}

// Inline code called during worker instantiation
// Start the GossipWorker
self.gossipWorker = new GossipWorker()

// Messages from outside are dispatched through the MessageEmitter interface
self.addEventListener('message', evtMessage => {
  self.gossipWorker.dispatchMessage(evtMessage.data)
})
