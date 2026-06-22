import EventEmitter from 'events';
import { BASE_URL } from '../config';

class CallManager extends EventEmitter {
    constructor() {
        super();
        this.peers = new Map(); // targetUserId -> RTCPeerConnection
        this.remoteStreams = new Map(); // targetUserId -> MediaStream
        this.remoteScreenStreams = new Map(); // targetUserId -> MediaStream (Screen Share)
        this.knownScreenStreamIds = new Set(); // Set of known stream IDs that are screens
        this.localStream = null;
        
        this.callHub = null;
        this._boundHub = null; // Track which hub we've already bound events to
        this.currentUser = null;
        this.activeCallId = null;
        this.token = null;
        this.tokenExpired = false;
        this.peerStats = new Map(); // Store stats state per peer

        this.iceServers = [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun.cloudflare.com:3478' }
        ];

        this.iceCandidateQueues = new Map(); // userId -> RTCIceCandidate[]
        this.remoteDescriptionSets = new Map(); // userId -> boolean

        this.isVideoEnabled = false;
        this.isMuted = false;
        this.isScreenSharing = false;
        this.isVirtualBackground = false;
        this.screenStream = null;
        this.canvasInterval = null;
    }

    init(callHub, currentUser, token) {
        this.currentUser = currentUser;
        this.token = token;
        // Only bind hub events if hub changed (prevents duplicate listeners)
        if (callHub && callHub !== this._boundHub) {
            this.callHub = callHub;
            this._boundHub = callHub;
            this.fetchIceServers();
            this._bindHubEvents();
        } else if (callHub) {
            this.callHub = callHub;
        }
    }

    async fetchIceServers() {
        if (this.tokenExpired) return;
        try {
            const actualToken = this.token || localStorage.getItem('token');
            const res = await fetch(`${BASE_URL}/api/call/ice-servers`, {
                headers: { 'Authorization': `Bearer ${actualToken}` }
            });
            if (res.status === 401) {
                console.warn("[CallManager] Token expired or invalid (401). Stopping ICE fetches.");
                this.tokenExpired = true;
                return;
            }
            if (res.ok) {
                const data = await res.json();
                if (data.iceServers && data.iceServers.length > 0) {
                    this.iceServers = data.iceServers;
                }
            }
        } catch (e) {
            console.warn("[CallManager] ICE fetch failed, using fallback STUN.", e);
        }
    }

    _bindHubEvents() {
        if (!this.callHub) return;

        this.callHub.on("ReceiveSignaling", async (data) => {
            if (!this.activeCallId) return; // Prevent devices that didn't answer from processing signals
            if (data.senderId.toLowerCase() === this.currentUser.id.toLowerCase()) return;
            if (data.messageType === "ScreenStreamId") {
                await this.handleScreenStreamId(data.senderId.toLowerCase(), data.payload);
                return;
            } else if (data.messageType === "ScreenStreamStopped") {
                this.knownScreenStreamIds.delete(data.payload);
                const targetStream = this.remoteScreenStreams.get(data.senderId.toLowerCase());
                if (targetStream && targetStream.id === data.payload) {
                    this.remoteScreenStreams.delete(data.senderId.toLowerCase());
                    this.emit('remote_screen_removed', data.senderId.toLowerCase());
                }
                return;
            }

            const signal = JSON.parse(data.payload);

            if (data.messageType === "Offer") {
                await this.handleOffer(data.senderId.toLowerCase(), signal);
            } else if (data.messageType === "Answer") {
                await this.handleAnswer(data.senderId.toLowerCase(), signal);
            } else if (data.messageType === "Candidate") {
                await this.handleCandidate(data.senderId.toLowerCase(), signal);
            }
        });

        // CallAccepted is handled by App.jsx -> CallOverlay.jsx state change, preventing duplicate offers

        this.callHub.on("CallEnded", (data) => {
            if (data && data.callId && this.activeCallId && data.callId.toLowerCase() === this.activeCallId.toLowerCase()) {
                this.leaveCall();
            }
        });

        this.callHub.on("UserJoinedCall", async (data) => {
            if (data.userId.toLowerCase() === this.currentUser?.id.toLowerCase()) return;
            // Another user joined our group call. They will send an offer, or we can send an offer.
            // Usually, the existing participants send an offer to the new participant.
            await this.startPipelineAndOffer(data.userId.toLowerCase());
        });

        // Also handle ParticipantJoinedGroupCall from JoinMeetingById
        this.callHub.on("ParticipantJoinedGroupCall", async (data) => {
            if (!data.participantId || data.participantId.toLowerCase() === this.currentUser?.id.toLowerCase()) return;
            await this.startPipelineAndOffer(data.participantId.toLowerCase());
        });

        this.callHub.on("UserLeftCall", (data) => {
            this.removePeer(data.userId.toLowerCase());
        });
        
        this.callHub.on("ForceDisconnectCall", (data) => {
            if (data && data.callId && this.activeCallId && data.callId.toLowerCase() === this.activeCallId.toLowerCase()) {
                this.leaveCall();
                this.emit("forced_disconnect");
            }
        });
    }

    async joinCall(callId, targetUserIds, isVideoEnabled, sendOffers = true) {
        this.activeCallId = callId;
        this.isVideoEnabled = isVideoEnabled;

        await this.initializeLocalStream();

        for (let targetId of targetUserIds) {
            targetId = targetId.toLowerCase();
            if (targetId !== this.currentUser.id.toLowerCase()) {
                if (sendOffers) {
                    await this.startPipelineAndOffer(targetId);
                } else {
                    this.createPeerConnection(targetId);
                }
            }
        }
        this.startStatsMonitoring();
    }

    async initializeLocalStream() {
        if (this.localStream) return;
        try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error("navigator.mediaDevices.getUserMedia is not supported or not running over HTTPS.");
            }

            const audioConstraints = { 
                sampleRate: { ideal: 48000 }, 
                channelCount: { ideal: 1 }, 
                sampleSize: { ideal: 16 }, 
                echoCancellation: true, 
                noiseSuppression: true, 
                autoGainControl: true 
            };
            
            const videoConstraints = { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24 } };

            try {
                // Try getting both if video is enabled
                const constraints = {
                    audio: audioConstraints,
                    video: this.isVideoEnabled ? videoConstraints : false
                };
                this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
            } catch (mediaErr) {
                console.warn("[CallManager] Failed to get requested media, attempting fallbacks:", mediaErr);
                
                // Fallback 1: Try audio only if video failed but was requested
                if (this.isVideoEnabled) {
                    try {
                        console.log("[CallManager] Falling back to audio-only mode.");
                        this.localStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints, video: false });
                        this.isVideoEnabled = false; // Override since we couldn't get video
                    } catch (audioErr) {
                        console.log("[CallManager] Audio fallback failed, trying video only.");
                        try {
                            this.localStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: videoConstraints });
                            this.isMuted = true; // Override since we have no audio
                        } catch (videoErr) {
                            console.warn("[CallManager] Both individual fallbacks failed. Joining in listen-only mode.");
                            this.localStream = new MediaStream(); // Empty stream for listen-only
                        }
                    }
                } else {
                    console.warn("[CallManager] Audio failed. Joining in listen-only mode.");
                    this.localStream = new MediaStream(); // Empty stream for listen-only
                }
            }
            
            this.emit("local_stream_changed", this.localStream);
        } catch (err) {
            console.error("[CallManager] Critical error initializing media:", err);
            this.localStream = new MediaStream();
            this.emit("local_stream_changed", this.localStream);
        }
    }

    createPeerConnection(targetUserIdRaw) {
        const targetUserId = targetUserIdRaw.toLowerCase();
        if (this.peers.has(targetUserId)) {
            this.peers.get(targetUserId).close();
            this.peers.delete(targetUserId);
        }

        const config = {
            iceServers: this.iceServers,
            iceCandidatePoolSize: 10,
            iceTransportPolicy: window.forceTurn ? "relay" : "all"
        };
        const pc = new RTCPeerConnection(config);
        console.log('[WebRTC Debug] Configuration:', pc.getConfiguration());

        if (true) { // Always log for diagnostics as requested
            window.pc = pc;
            pc.addEventListener('iceconnectionstatechange', () => console.log(`[WebRTC Debug] ICE State: ${pc.iceConnectionState}`));
            pc.addEventListener('connectionstatechange', () => console.log(`[WebRTC Debug] Connection State: ${pc.connectionState}`));
            pc.addEventListener('icegatheringstatechange', () => console.log(`[WebRTC Debug] ICE Gathering: ${pc.iceGatheringState}`));
            pc.addEventListener('signalingstatechange', () => console.log(`[WebRTC Debug] Signaling State: ${pc.signalingState}`));
            pc.addEventListener('icecandidateerror', (e) => {
                console.error(`[WebRTC Debug] ICE Candidate Error: code=${e.errorCode}, text=${e.errorText}, url=${e.url}, address=${e.address}, port=${e.port}`);
            });
            pc.addEventListener('track', (event) => console.log(`[WebRTC Debug] Track state: ${event.track.readyState}, kind: ${event.track.kind}`));
        }

        this.iceCandidateQueues.set(targetUserId, []);
        this.remoteDescriptionSets.set(targetUserId, false);

        pc.onicecandidate = (event) => {
            if (event.candidate && this.callHub) {
                console.log(`[WebRTC] ICE Candidate gathered: type=${event.candidate.type || 'unknown'}, protocol=${event.candidate.protocol}, address=${event.candidate.address || event.candidate.ip}`);
                this.callHub.invoke('SendSignalingMessage', targetUserId, 'Candidate', JSON.stringify(event.candidate));
            }
        };

        pc.ontrack = (event) => {
            const stream = event.streams[0] || new MediaStream([event.track]);
            if (this.knownScreenStreamIds.has(stream.id)) {
                this.remoteScreenStreams.set(targetUserId, stream);
                this.emit("remote_screen_added", targetUserId, stream);
            } else {
                this.remoteStreams.set(targetUserId, stream);
                this.emit("remote_track_added", targetUserId, stream);
            }
        };

        pc.oniceconnectionstatechange = async () => {
            console.log(`[CallManager] Peer ${targetUserId} ICE Connection State: ${pc.iceConnectionState}`);
            if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
                this.emit("peer_disconnected", targetUserId);
                
                console.warn(`[CallManager] Connection failed/disconnected with ${targetUserId}. Triggering ICE Restart...`);
                try {
                    if (typeof pc.restartIce === 'function') {
                        pc.restartIce();
                    }
                    const offer = await pc.createOffer({ iceRestart: true });
                    await pc.setLocalDescription(offer);
                    if (this.callHub && this.activeCallId) {
                        await this.callHub.invoke('SendSignalingMessage', targetUserId, 'Offer', JSON.stringify(offer));
                    }
                } catch (err) {
                    console.error(`[CallManager] Failed to restart ICE for ${targetUserId}:`, err);
                }
            }
        };

        pc.onconnectionstatechange = async () => {
            console.log(`[CallManager] Peer ${targetUserId} Connection State: ${pc.connectionState}`);
            if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
                console.warn(`[CallManager] ConnectionState is ${pc.connectionState} for ${targetUserId}. Triggering ICE Restart...`);
                try {
                    if (typeof pc.restartIce === 'function') {
                        pc.restartIce();
                    }
                    const offer = await pc.createOffer({ iceRestart: true });
                    await pc.setLocalDescription(offer);
                    if (this.callHub && this.activeCallId) {
                        await this.callHub.invoke('SendSignalingMessage', targetUserId, 'Offer', JSON.stringify(offer));
                    }
                } catch (err) {
                    console.error(`[CallManager] Failed to restart ICE on connection state change:`, err);
                }
            }
        };

        if (this.localStream) {
            this.localStream.getTracks().forEach(track => this._addTrackWithPriority(pc, track, this.localStream));
        }

        if (this.isScreenSharing && this.screenStream) {
            this.screenStream.getTracks().forEach(track => this._addTrackWithPriority(pc, track, this.screenStream));
        }

        this.peers.set(targetUserId, pc);
        return pc;
    }

    _addTrackWithPriority(pc, track, stream) {
        const sender = pc.addTrack(track, stream);
        try {
            const params = sender.getParameters();
            if (params && params.encodings && params.encodings.length > 0) {
                let changed = false;
                if (track.kind === 'audio') {
                    params.encodings[0].priority = 'high';
                    try { params.encodings[0].networkPriority = 'high'; } catch (e) {}
                    changed = true;
                } else if (track.kind === 'video') {
                    if (track.contentHint === 'detail') {
                        params.degradationPreference = 'maintain-resolution';
                        params.encodings[0].priority = 'medium';
                        try { params.encodings[0].networkPriority = 'medium'; } catch (e) {}
                    } else {
                        params.degradationPreference = 'maintain-framerate';
                        params.encodings[0].priority = 'low';
                        try { params.encodings[0].networkPriority = 'low'; } catch (e) {}
                    }
                    changed = true;
                }
                if (changed) {
                    sender.setParameters(params).catch(e => console.warn('[WebRTC] Failed to set priority parameters:', e));
                }
            }
        } catch (e) {
            console.warn('[WebRTC] priority setting not supported:', e);
        }
        return sender;
    }

    async handleScreenStreamId(senderId, streamId) {
        this.knownScreenStreamIds.set(streamId, senderId);
    }

    async startPipelineAndOffer(targetUserId) {
        await this.initializeLocalStream();
        const pc = this.createPeerConnection(targetUserId);

        if (this.isScreenSharing && this.screenStream && this.callHub) {
            this.callHub.invoke('SendSignalingMessage', targetUserId, 'ScreenStreamId', this.screenStream.id);
        }

        const offer = await pc.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true
        });
        await pc.setLocalDescription(offer);

        if (this.callHub) {
            this.callHub.invoke('SendSignalingMessage', targetUserId, 'Offer', JSON.stringify(offer));
        }
    }

    async handleOffer(senderId, offer) {
        await this.initializeLocalStream();
        const pc = this.createPeerConnection(senderId);

        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        this.remoteDescriptionSets.set(senderId, true);
        await this.flushIceCandidates(senderId, pc);

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        if (this.callHub) {
            this.callHub.invoke('SendSignalingMessage', senderId, 'Answer', JSON.stringify(answer));
        }
    }

    async handleAnswer(senderId, answer) {
        const pc = this.peers.get(senderId);
        if (!pc) return;
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        this.remoteDescriptionSets.set(senderId, true);
        await this.flushIceCandidates(senderId, pc);
    }

    async handleCandidate(senderId, candidate) {
        const pc = this.peers.get(senderId);
        if (!pc) return;

        if (!this.remoteDescriptionSets.get(senderId)) {
            const queue = this.iceCandidateQueues.get(senderId) || [];
            queue.push(candidate);
            this.iceCandidateQueues.set(senderId, queue);
            return;
        }

        try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
            console.warn('[CallManager] Failed to add ICE candidate:', e);
        }
    }

    async flushIceCandidates(senderId, pc) {
        const queue = this.iceCandidateQueues.get(senderId) || [];
        for (const candidate of queue) {
            try {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (e) {
                console.warn('[CallManager] Failed to add queued ICE candidate:', e);
            }
        }
        this.iceCandidateQueues.set(senderId, []);
    }

    toggleMute() {
        if (this.localStream) {
            this.isMuted = !this.isMuted;
            this.localStream.getAudioTracks().forEach(track => track.enabled = !this.isMuted);
            this.emit("muted_changed", this.isMuted);
        }
    }

    async toggleVideo() {
        this.isVideoEnabled = !this.isVideoEnabled;
        if (this.isVideoEnabled) {
            try {
                const videoStream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
                const videoTrack = videoStream.getVideoTracks()[0];
                if (this.localStream) {
                    this.localStream.addTrack(videoTrack);
                } else {
                    this.localStream = videoStream;
                }
                
                // Renegotiate with all peers
                for (const [userId, pc] of this.peers.entries()) {
                    const senders = pc.getSenders();
                    const videoSender = senders.find(s => s.track && s.track.kind === 'video');
                    if (videoSender) {
                        await videoSender.replaceTrack(videoTrack);
                    } else {
                        this._addTrackWithPriority(pc, videoTrack, this.localStream);
                        const offer = await pc.createOffer({
                            offerToReceiveAudio: true,
                            offerToReceiveVideo: true
                        });
                        await pc.setLocalDescription(offer);
                        this.callHub.invoke('SendSignalingMessage', userId, 'Offer', JSON.stringify(offer));
                    }
                }
            } catch (err) {
                console.error("Video toggle failed:", err);
                this.isVideoEnabled = false;
            }
        } else {
            const videoTrack = this.localStream?.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.stop();
                this.localStream.removeTrack(videoTrack);
                
                for (const [userId, pc] of this.peers.entries()) {
                    const senders = pc.getSenders();
                    const videoSender = senders.find(s => s.track && s.track.kind === 'video');
                    if (videoSender) {
                        pc.removeTrack(videoSender);
                        try {
                            const offer = await pc.createOffer();
                            await pc.setLocalDescription(offer);
                            this.callHub.invoke('SendSignalingMessage', userId, 'Offer', JSON.stringify(offer));
                        } catch (e) {
                            console.warn("Renegotiation failed:", e);
                        }
                    }
                }
            }
        }
        this.emit("video_changed", this.isVideoEnabled);
        this.emit("local_stream_changed", this.localStream);
    }

    async toggleScreenShare() {
        try {
            if (this.isScreenSharing) {
                this.isScreenSharing = false;
                if (this.screenStream) {
                    const streamId = this.screenStream.id;
                    this.screenStream.getTracks().forEach(t => t.stop());
                    
                    for (const [userId, pc] of this.peers.entries()) {
                        const senders = pc.getSenders();
                        const screenSender = senders.find(s => s.track && this.screenStream.getTracks().includes(s.track));
                        if (screenSender) {
                            pc.removeTrack(screenSender);
                        }
                        
                        if (this.callHub) {
                            this.callHub.invoke('SendSignalingMessage', userId, 'ScreenStreamStopped', streamId);
                        }
                        const offer = await pc.createOffer();
                        await pc.setLocalDescription(offer);
                        if (this.callHub) {
                            this.callHub.invoke('SendSignalingMessage', userId, 'Offer', JSON.stringify(offer));
                        }
                    }

                    this.screenStream = null;
                }
                
                this.emit("screen_share_changed", this.isScreenSharing);
            } else {
                this.screenStream = await navigator.mediaDevices.getDisplayMedia({ 
                    video: { 
                        width: { ideal: 1920 },
                        height: { ideal: 1080 },
                        frameRate: { ideal: 30 } 
                    } 
                });
                this.isScreenSharing = true;
                
                const screenTrack = this.screenStream.getVideoTracks()[0];
                screenTrack.contentHint = 'detail';
                
                screenTrack.onended = () => {
                    if (this.isScreenSharing) {
                        this.toggleScreenShare(); 
                    }
                };

                for (const [userId, pc] of this.peers.entries()) {
                    this._addTrackWithPriority(pc, screenTrack, this.screenStream);
                    
                    if (this.callHub) {
                        this.callHub.invoke('SendSignalingMessage', userId, 'ScreenStreamId', this.screenStream.id);
                    }
                    
                    const offer = await pc.createOffer();
                    await pc.setLocalDescription(offer);
                    if (this.callHub) {
                        this.callHub.invoke('SendSignalingMessage', userId, 'Offer', JSON.stringify(offer));
                    }
                }
                
                this.emit("screen_share_changed", this.isScreenSharing);
            }
        } catch (err) {
            console.error("[CallManager] Failed to toggle screen share", err);
        }
    }

    async toggleVirtualBackground(effectType = 'blur') {
        if (!this.isVideoEnabled && !this.isVirtualBackground) return;

        try {
            if (this.isVirtualBackground) {
                this.isVirtualBackground = false;
                if (this.canvasInterval) clearInterval(this.canvasInterval);
                
                const videoStream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
                const videoTrack = videoStream.getVideoTracks()[0];
                
                const existingVideo = this.localStream.getVideoTracks()[0];
                if (existingVideo) {
                    existingVideo.stop();
                    this.localStream.removeTrack(existingVideo);
                }
                this.localStream.addTrack(videoTrack);
                
                for (const pc of this.peers.values()) {
                    const videoSender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
                    if (videoSender) await videoSender.replaceTrack(videoTrack);
                }
                
                this.emit("local_stream_changed", this.localStream);
                this.emit("virtual_bg_changed", this.isVirtualBackground);
            } else {
                this.isVirtualBackground = true;
                
                const rawStream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
                const rawVideo = document.createElement('video');
                rawVideo.srcObject = rawStream;
                rawVideo.play();
                
                const canvas = document.createElement('canvas');
                canvas.width = 640;
                canvas.height = 480;
                const ctx = canvas.getContext('2d');
                
                this.canvasInterval = setInterval(() => {
                    if (rawVideo.readyState === rawVideo.HAVE_ENOUGH_DATA) {
                        ctx.save();
                        if (effectType === 'blur') {
                            ctx.filter = 'sepia(0.8)'; // Mocking blur with sepia
                        } else {
                            ctx.filter = 'grayscale(100%)';
                        }
                        ctx.drawImage(rawVideo, 0, 0, canvas.width, canvas.height);
                        
                        ctx.filter = 'none';
                        ctx.fillStyle = 'white';
                        ctx.font = '24px Arial';
                        ctx.fillText('VB Active', 20, 40);
                        
                        ctx.restore();
                    }
                }, 1000 / 30);
                
                const canvasStream = canvas.captureStream(30);
                const processedTrack = canvasStream.getVideoTracks()[0];
                
                const existingVideo = this.localStream.getVideoTracks()[0];
                if (existingVideo) {
                    existingVideo.stop();
                    this.localStream.removeTrack(existingVideo);
                }
                this.localStream.addTrack(processedTrack);
                
                for (const pc of this.peers.values()) {
                    const videoSender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
                    if (videoSender) await videoSender.replaceTrack(processedTrack);
                }
                
                this.emit("local_stream_changed", this.localStream);
                this.emit("virtual_bg_changed", this.isVirtualBackground);
            }
        } catch (e) {
            console.error("[CallManager] Failed to toggle virtual background", e);
            this.isVirtualBackground = false;
        }
    }

    removePeer(userId) {
        const pc = this.peers.get(userId);
        if (pc) {
            pc.close();
            this.peers.delete(userId);
        }
        
        if (this.remoteStreams.has(userId)) {
            this.remoteStreams.get(userId).getTracks().forEach(t => t.stop());
            this.remoteStreams.delete(userId);
        }
        if (this.remoteScreenStreams.has(userId)) {
            this.remoteScreenStreams.get(userId).getTracks().forEach(t => t.stop());
            this.remoteScreenStreams.delete(userId);
        }
        
        this.iceCandidateQueues.delete(userId);
        this.remoteDescriptionSets.delete(userId);
        this.emit("peer_removed", userId);
    }

    leaveCall(silent = false) {
        this.stopStatsMonitoring();
        for (const [userId, pc] of this.peers.entries()) {
            pc.close();
        }
        this.peers.clear();
        
        for (const stream of this.remoteStreams.values()) {
            stream.getTracks().forEach(track => track.stop());
        }
        for (const stream of this.remoteScreenStreams.values()) {
            stream.getTracks().forEach(track => track.stop());
        }
        
        this.remoteStreams.clear();
        this.remoteScreenStreams.clear();
        this.knownScreenStreamIds.clear();
        this.iceCandidateQueues.clear();
        this.remoteDescriptionSets.clear();

        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }

        if (this.screenStream) {
            this.screenStream.getTracks().forEach(track => track.stop());
            this.screenStream = null;
        }
        this.isScreenSharing = false;

        if (this.callHub && this.activeCallId && !silent) {
            this.callHub.invoke("EndCall", this.activeCallId).catch(console.warn);
        }

        this.activeCallId = null;
        if (!silent) this.emit("call_ended");
    }

    startStatsMonitoring() {
        if (this.statsInterval) clearInterval(this.statsInterval);
        
        if (!this.peerStats) this.peerStats = new Map();

        this.statsInterval = setInterval(async () => {
            if (this.peers.size === 0) return;
            
            for (const [userId, pc] of this.peers.entries()) {
                try {
                    if (!this.peerStats.has(userId)) {
                        this.peerStats.set(userId, {
                            stableCount: 0,
                            previousBytesSentVideo: 0,
                            previousTimestampVideoOut: 0,
                            previousBytesReceivedVideo: 0,
                            previousTimestampVideoIn: 0,
                            previousBytesSentAudio: 0,
                            previousTimestampAudioOut: 0,
                            previousBytesReceivedAudio: 0,
                            previousTimestampAudioIn: 0
                        });
                    }
                    const pStat = this.peerStats.get(userId);

                    const stats = await pc.getStats();
                    let activeCandidatePair = null;
                    let inboundAudio = null;
                    let inboundVideo = null;
                    let outboundVideo = null;
                    let outboundAudio = null;
                    let jitter = 0;
                    
                    stats.forEach(report => {
                        if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                            activeCandidatePair = report;
                        }
                        if (report.type === 'inbound-rtp') {
                            if (report.kind === 'audio') inboundAudio = report;
                            if (report.kind === 'video') inboundVideo = report;
                            if (report.jitter && report.jitter > jitter) jitter = report.jitter * 1000;
                        }
                        if (report.type === 'outbound-rtp') {
                            if (report.kind === 'video') outboundVideo = report;
                            if (report.kind === 'audio') outboundAudio = report;
                        }
                    });

                    let videoBitrateOut = 0;
                    let audioBitrateOut = 0;
                    let videoBitrateIn = 0;
                    let audioBitrateIn = 0;

                    if (outboundVideo) {
                        const bytesSent = outboundVideo.bytesSent;
                        const timestamp = outboundVideo.timestamp;
                        if (pStat.previousTimestampVideoOut > 0) {
                            videoBitrateOut = (8 * (bytesSent - pStat.previousBytesSentVideo)) / (timestamp - pStat.previousTimestampVideoOut);
                        }
                        pStat.previousBytesSentVideo = bytesSent;
                        pStat.previousTimestampVideoOut = timestamp;
                    }
                    
                    if (inboundVideo) {
                        const bytesReceived = inboundVideo.bytesReceived;
                        const timestamp = inboundVideo.timestamp;
                        if (pStat.previousTimestampVideoIn > 0) {
                            videoBitrateIn = (8 * (bytesReceived - pStat.previousBytesReceivedVideo)) / (timestamp - pStat.previousTimestampVideoIn);
                        }
                        pStat.previousBytesReceivedVideo = bytesReceived;
                        pStat.previousTimestampVideoIn = timestamp;
                    }

                    if (outboundAudio) {
                        const bytesSent = outboundAudio.bytesSent;
                        const timestamp = outboundAudio.timestamp;
                        if (pStat.previousTimestampAudioOut > 0) {
                            audioBitrateOut = (8 * (bytesSent - pStat.previousBytesSentAudio)) / (timestamp - pStat.previousTimestampAudioOut);
                        }
                        pStat.previousBytesSentAudio = bytesSent;
                        pStat.previousTimestampAudioOut = timestamp;
                    }
                    
                    if (inboundAudio) {
                        const bytesReceived = inboundAudio.bytesReceived;
                        const timestamp = inboundAudio.timestamp;
                        if (pStat.previousTimestampAudioIn > 0) {
                            audioBitrateIn = (8 * (bytesReceived - pStat.previousBytesReceivedAudio)) / (timestamp - pStat.previousTimestampAudioIn);
                        }
                        pStat.previousBytesReceivedAudio = bytesReceived;
                        pStat.previousTimestampAudioIn = timestamp;
                    }

                    const videoBitrate = Math.max(videoBitrateOut, videoBitrateIn);
                    const audioBitrate = Math.max(audioBitrateOut, audioBitrateIn);
                    const combinedBitrate = videoBitrate + audioBitrate;

                    let state = 'direct';
                    let typeLabel = 'Direct P2P (STUN)';
                    let candidateType = 'Unknown';
                    let transport = 'Unknown';
                    let rtt = 0;
                    
                    if (activeCandidatePair) {
                        if (activeCandidatePair.currentRoundTripTime !== undefined) rtt = activeCandidatePair.currentRoundTripTime * 1000;
                        
                        const localCandidate = stats.get(activeCandidatePair.localCandidateId);
                        const remoteCandidate = stats.get(activeCandidatePair.remoteCandidateId);
                        
                        if (localCandidate && remoteCandidate) {
                            const localType = localCandidate.candidateType;
                            const remoteType = remoteCandidate.candidateType;
                            candidateType = `${localType} → ${remoteType}`;
                            transport = localCandidate.protocol || 'udp';
                            
                            if (localType === 'relay' || remoteType === 'relay') {
                                state = 'relay';
                                typeLabel = 'Relayed via TURN';
                                // Log explicitly to let user confirm TURN is used
                                // console.log(`[WebRTC] TURN allocation successful. Protocol: ${transport}`);
                            } else if (localType === 'host' && remoteType === 'host') {
                                state = 'lan';
                                typeLabel = 'Local Direct (LAN)';
                            } else {
                                state = 'direct';
                                typeLabel = 'Direct P2P (STUN)';
                            }
                        }
                    } else if (pc.iceConnectionState === 'checking' || pc.iceConnectionState === 'disconnected') {
                        state = 'reconnecting';
                        typeLabel = 'Reconnecting';
                    } else if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'closed') {
                        state = 'failed';
                        typeLabel = 'Connection Lost';
                    }
                    
                    let packetsLost = 0;
                    let totalPackets = 0;
                    if (inboundAudio) { packetsLost += (inboundAudio.packetsLost || 0); totalPackets += (inboundAudio.packetsReceived || 0); }
                    if (inboundVideo) { packetsLost += (inboundVideo.packetsLost || 0); totalPackets += (inboundVideo.packetsReceived || 0); }
                    
                    const lossPercentage = totalPackets > 0 ? (packetsLost / totalPackets) * 100 : 0;
                    
                    let quality = 'Excellent';
                    
                    if (rtt > 400 && (lossPercentage > 5 || combinedBitrate < 300000)) {
                        quality = 'Critical';
                        pStat.stableCount = 0;
                    } else if (rtt > 400 || lossPercentage > 5) {
                        quality = 'Poor';
                        pStat.stableCount = 0;
                    } else if (rtt > 200 || lossPercentage > 2) {
                        quality = 'Good';
                        pStat.stableCount = 0;
                    } else {
                        pStat.stableCount++;
                        if (lossPercentage < 1 && pStat.stableCount >= 4) { // ~12 seconds stability
                            quality = 'Excellent';
                        } else {
                            quality = 'Good'; // Recovery buffer
                        }
                    }

                    // Adaptive Degradation via Parameters
                    const senders = pc.getSenders();
                    
                    if (this.isVideoEnabled || this.isScreenSharing) {
                        // Handle Camera Video
                        const videoSender = senders.find(s => s.track && s.track.kind === 'video' && (!this.screenStream || !this.screenStream.getTracks().includes(s.track)));
                        if (videoSender) {
                            try {
                                const params = videoSender.getParameters();
                                if (params && params.encodings && params.encodings.length > 0) {
                                    params.degradationPreference = 'maintain-framerate';
                                    if (quality === 'Excellent') {
                                        params.encodings[0].maxBitrate = 1500000;
                                        params.encodings[0].scaleResolutionDownBy = 1;
                                        params.encodings[0].maxFramerate = 30;
                                    } else if (quality === 'Good') {
                                        params.encodings[0].maxBitrate = 800000;
                                        params.encodings[0].scaleResolutionDownBy = 1.5;
                                        params.encodings[0].maxFramerate = 24;
                                    } else if (quality === 'Poor') {
                                        params.encodings[0].maxBitrate = 400000;
                                        params.encodings[0].scaleResolutionDownBy = 2;
                                        params.encodings[0].maxFramerate = 15;
                                    } else {
                                        // Critical
                                        params.encodings[0].maxBitrate = 150000;
                                        params.encodings[0].scaleResolutionDownBy = 2;
                                        params.encodings[0].maxFramerate = 10;
                                    }
                                    await videoSender.setParameters(params);
                                }
                            } catch (e) {
                                console.warn('[CallManager] Failed to apply video adaptive caps', e);
                            }
                        }

                        // Handle Screen Share
                        const screenSender = senders.find(s => s.track && this.screenStream && this.screenStream.getTracks().includes(s.track));
                        if (screenSender) {
                            try {
                                const params = screenSender.getParameters();
                                if (params && params.encodings && params.encodings.length > 0) {
                                    params.degradationPreference = 'maintain-resolution';
                                    params.encodings[0].scaleResolutionDownBy = 1;
                                    if (quality === 'Excellent' || quality === 'Good') {
                                        params.encodings[0].maxBitrate = 2000000;
                                        params.encodings[0].maxFramerate = 15;
                                    } else if (quality === 'Poor') {
                                        params.encodings[0].maxBitrate = 1200000;
                                        params.encodings[0].maxFramerate = 10;
                                    } else {
                                        // Critical
                                        params.encodings[0].maxBitrate = 800000;
                                        params.encodings[0].maxFramerate = 5;
                                    }
                                    await screenSender.setParameters(params);
                                }
                            } catch (e) {
                                console.warn('[CallManager] Failed to apply screen share adaptive caps', e);
                            }
                        }
                    }

                    // Handle Audio
                    const audioSender = senders.find(s => s.track && s.track.kind === 'audio');
                    if (audioSender) {
                        try {
                            const params = audioSender.getParameters();
                            if (params && params.encodings && params.encodings.length > 0) {
                                params.encodings[0].maxBitrate = 64000;
                                await audioSender.setParameters(params);
                            }
                        } catch (e) {}
                    }

                    let currentResolution = 'Unknown';
                    let currentFramerate = 0;
                    if (outboundVideo && outboundVideo.frameWidth) {
                        currentResolution = `${outboundVideo.frameWidth}x${outboundVideo.frameHeight}`;
                        currentFramerate = outboundVideo.framesPerSecond || 0;
                    } else if (inboundVideo && inboundVideo.frameWidth) {
                         currentResolution = `${inboundVideo.frameWidth}x${inboundVideo.frameHeight}`;
                         currentFramerate = inboundVideo.framesPerSecond || 0;
                    }

                    this.emit("connection_quality", {
                        userId,
                        state,
                        typeLabel,
                        quality,
                        rtt: Math.round(rtt),
                        lossPercentage: lossPercentage.toFixed(2),
                        jitter: Math.round(jitter),
                        audioBitrate: Math.round(audioBitrate),
                        videoBitrate: Math.round(videoBitrate),
                        combinedBitrate: Math.round(combinedBitrate),
                        resolution: currentResolution,
                        framerate: Math.round(currentFramerate),
                        candidateType,
                        transport,
                        iceState: pc.iceConnectionState,
                        connectionState: pc.connectionState,
                        signalingState: pc.signalingState
                    });
                } catch (err) {
                    console.warn(`[CallManager] Failed to get stats for user ${userId}`, err);
                }
            }
        }, 3000);
    }

    stopStatsMonitoring() {
        if (this.statsInterval) {
            clearInterval(this.statsInterval);
            this.statsInterval = null;
        }
    }

    cleanup() {
        // Silent cleanup — don't invoke EndCall or emit call_ended, the parent handles it
        this.leaveCall(true);
        // Don't null out callHub or _boundHub so next init() reuses the same binding
        this.removeAllListeners();
    }
}

const callManagerInstance = new CallManager();
export default callManagerInstance;
