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
'use strict'

import * as datachannel from './datachannel.js'
export default PeerConnection

/**
 * @external RTCPeerConnection
 * @see http://www.w3.org/TR/webrtc/#rtcpeerconnection-interface
 */
var RTCPeerConnection =
    window.RTCPeerConnection ||
    window.mozRTCPeerConnection ||
    window.webkitRTCPeerConnection
/**
 * @external RTCSessionDescription
 * @see http://www.w3.org/TR/webrtc/#idl-def-RTCSessionDescription
 */
var RTCSessionDescription =
    window.RTCSessionDescription ||
    window.mozRTCSessionDescription ||
    window.webkitRTCSessionDescription
/**
 * @external RTCConfiguration
 * @see http://www.w3.org/TR/webrtc/#idl-def-RTCConfiguration
 */
var RTCConfiguration = {
  iceServers: [
    { // Amazon
      /**
       * @memberof external:RCTConfiguration.iceServers
       * @deprecated replaced by `urls`
       */
      url: 'stun:23.21.150.121',
      urls: 'stun:23.21.150.121'
    }, {
      url: 'stun:stun.l.google.com:19302',
      urls: 'stun:stun.l.google.com:19302'
    }
  ],
  iceTransports: 'all', // none relay all
  peerIdentity: null
}
var MediaConstraints// Should NOT be defined

Object.defineProperty(RTCPeerConnection.prototype, 'readyState', {
  get: function() {
    return typeof this.channel === 'undefined' ?
      'connecting' : this.channel.readyState
  },
  configurable: true
})

/**
 * The PeerConnection is a RTCPeerConnection configured to forward event to the
 * Peer object attached to it.
 *
 * @class PeerConnection
 * @augments external:RTCPeerConnection
 * @param {Peer} peer - Peer holding the connection (usually the local node)
 * @param {string} remotePeer - Id of the remote peer
 * @property {string} id - Id of the peer
 * @property {string} remotePeer - Id of the remote peer
 * @property {RTCDataChannelState} readyState - Indicates the state of the
 *           connection
 */
function PeerConnection(peer, remotePeer) {
  // TODO Inheritance: Can we extend RTCPeerConnection directly?
  //      RTCPeerConnection.call(this, RTCConfiguration)
  var id = peer.id
  var pc = new RTCPeerConnection(RTCConfiguration, MediaConstraints)

  pc.id = id
  pc.remotePeer = remotePeer
  pc.timestamp = Date.now()
  pc.weight = 'light'

  /**
   * Create and configure the DataChannel for the PeerConnection
   * @see DataChannel for the list of configurations
   *
   * @function PeerConnection#createChannel
   * @return {DataChannel} The configured DataChannel
   */
  pc.createChannel = function() {
    pc.channel = datachannel.create(peer, pc, remotePeer)
    return pc.channel
  }

  /**
   * Creates the SDPOffer to open a connection to the remote peer
   *
   * @function PeerConnection#createSDPOffer
   * @param {Function} sendOffer - Use the signaling server to transmit the
   *        offer to the remote Peer
   */
  pc.createSDPOffer = function(sendOffer) {
    // TODO Use generators when available
    pc.createOffer(function(offer) {
      pc.setLocalDescription(offer, function() {
        sendOffer(offer)
      }, () => { throw new Error('Failed to set local description') })
    }, () => { throw new Error('Failed to create SDP offer') })
  }

  /**
   * Create a SDPAnswer from a SDPOffer and send it to the remote peer
   *
   * @function PeerConnection#createSDPAnswer
   * @param {string} remoteSDP - Id of the remote peer
   * @param {Function} sendAnswer - callback used to send the SDPAnswer. Use
   *        the signaling system to transmit it
   */
  pc.createSDPAnswer = function(remoteSDP, sendAnswer) {
    // TODO Use generator when available
    remoteSDP = new RTCSessionDescription(remoteSDP)
    pc.setRemoteDescription(remoteSDP, function() {
      // Then create the answer
      pc.createAnswer(function(answer) {
        // Then set local description from the answer
        pc.setLocalDescription(answer, function success() {
          // ... and send it
          sendAnswer(answer)
        }, e => { throw e })
      }, e => { throw e })
    }, e => { throw e })
  }

  /**
   * Use the DataChannel to transmit the message to the remote peer
   *
   * @function PeerConnection#send
   * @param {Message} message - message that should be sent to the remote peer
   */
  pc.send = function(message) {
    this.timestamp = Date.now
    if('open' === pc.readyState) {
      pc.channel.send(JSON.stringify(message))
    }
  }

  // Events

  /**
   * Send ICECandidates to the remote peer as soon as they are received. We
   * cannot use the connection to send them as it probably isn't open yet and
   * the ICECandidates are need by the remote peer to establish connection.
   *
   * @param {Event} event - Contains the candidate when the callback is fired
   */
  pc.onicecandidate = function(event) {
    if(null === event.candidate) {
      return
    }
    peer.send({
      type: 'icecandidate',
      from: id,
      to: remotePeer,
      ttl: peer.ttl,
      data: event.candidate,
      forwardBy: []
    })
  }

  /**
   * When a the remote peer opens a DataChannel, it adds the default event
   * handlers and tells the Peer to emit an `onconnected` event
   *
   * @param {Event} event - Contains a RTCDataChannel created by the remote peer
   */
  pc.ondatachannel = function(event) {
    pc.channel = datachannel.setHandlers(
      event.channel,
      peer,
      pc,
      remotePeer)
  }

  // Supercharged RTCPeerConnection
  return pc
}
