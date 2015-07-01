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
 * @flow weak
 */

/**
 * Wrapper setting handlers of a RTCDatachannel from a given PeerConnection
 * @module datachannel
 */

/**
 * @typedef DataChannel
 * @desc Augmented RTCDataChannel with configured callbacks used to transmit
 *       information to other peers and relay received data to the
 *       PeerConnection instance it is attached to
 * @augments external:RTCDataChannel
 * @see http://w3c.github.io/webrtc-pc/#idl-def-RTCDataChannel
 * @see https://developer.mozilla.org/en-US/docs/Web/API/RTCDataChannel
 */

/**
 * Options used for the creation of a DataChannel
 *
 * @const {Object} options
 * @inner
 * @memberof module:datachannel
 * @property {Array.<Object>} [optional]
 */
export const options = {}

/**
 * When a peer disconnect the channel is closed. We update the connection's
 * status of the Peer
 */
var onclose = function(peer, peerConnection, remotePeer, event) {
  peer.dispatchMessage({
    type: 'disconnected',
    to: peer.id,
    from: remotePeer,
    data: event
  })
}

/** An error has been thrown by the DataChannel */
var onerror = function(error) {
  console.error('Channel error:', error)
}

/**
 * When a message is received through the channel we send it to the Peer
 * onmessage handler. This allows us to handle data recevied through both the
 * signaling system and the mesh network with the same functions
 *
 * @param {Peer} peer - Messages will be forwarded to this Peer
 * @param {Event} event - Contains the message sent by the remote peer
 */
var onmessage = function(peer, event) {
  var message = JSON.parse(event.data)
  if(-1 === message.to || peer.id === message.to) {
    peer.dispatchMessage(message)
  } else if(message.ttl > 0) {
    peer.forward(message)
  }
}

/**
 * Relay to the Peer instance the initialization of the data channel and save
 * it in the PeerConnection
 *
 * @param {Event} event
 */
var onopen = function(peer, peerConnection, remotePeer, event) {
  var channel = event.target
  if('open' === channel.readyState.toLowerCase()) {
    peerConnection.channel = channel
    peer.dispatchMessage({
      type: 'connected',
      from: remotePeer,
      to: peer.id,
      data: event
    })
  }
}

/**
 * Set all the callbacks of a newly created DataChannel
 *
 * @function module:datachannel~setHandlers
 * @param {RTCDataChannel} channel - Channel to be configured
 * @param {Peer} peer - Events must be forwarded to this Peer
 * @param {PeerConnection} peerConnection - PeerConnection where the DataChannel
 *        will be stored
 * @param {string} id - Id of the remote peer
 * @return {DataChannel} Some {@link DataChannel}
 */
export function setHandlers(channel, peer, peerConnection, remotePeer) {
  channel.onclose = onclose.bind(null, peer, peerConnection, remotePeer)
  channel.onerror = onerror
  channel.onmessage = onmessage.bind(null, peer)
  channel.onopen = onopen.bind(null, peer, peerConnection, remotePeer)

  return channel
}

/**
 * Creates a new DataChannel from a PeerConnection object and add the callbacks
 * needed to forward events to the Peer and PeerConnection objects (like a
 * connection/disconnection, error and reception of messages)
 *
 * @function module:datachannel~create
 * @param {Peer} peer - Events will be forwarded to this Peer
 * @param {PeerConnection} peerConnection - PeerConnection where the
 *        DataChannel will be stored
 * @param {string} id - Id of the remote peer
 * @return {DataChannel}
 */
export function create(peer, peerConnection, remotePeer) {
  var channel = peerConnection.createDataChannel(
    peer.id + '-' + remotePeer,
    this.options)
  return setHandlers(channel, peer, peerConnection, remotePeer)
}
