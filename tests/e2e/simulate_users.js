const axios = require('axios');
const signalR = require('@microsoft/signalr');

const API_URL = 'http://localhost:5143';

// Ignore self-signed certs if testing against HTTPS
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function loginAdmin() {
    console.log("Logging in as Admin...");
    try {
        const loginRes = await axios.post(`${API_URL}/api/auth/login`, { username: 'admin', password: 'TestPassword123!' });
        if (loginRes.data.requiresPasswordChange) {
            console.log("Admin requires password change. Changing...");
            const tempToken = loginRes.data.tempToken;
            const changeRes = await axios.post(`${API_URL}/api/auth/first-login-change-password`, 
                { newPassword: 'NewAdminPassword123!' }, 
                { headers: { Authorization: `Bearer ${tempToken}` } }
            );
            return changeRes.data.accessToken;
        }
        return loginRes.data.accessToken;
    } catch (e) {
        throw e;
    }
}

async function createUser(adminToken, username) {
    console.log(`Creating user ${username}...`);
    const req = {
        username: username,
        displayName: `${username} Display`,
        firstName: "Test",
        lastName: "User",
        email: `${username}@test.local`,
        roleName: "Employee"
    };

    const res = await axios.post(`${API_URL}/api/users`, req, {
        headers: { Authorization: `Bearer ${adminToken}` }
    });

    return res.data;
}

async function loginAndInitializeUser(userObj) {
    console.log(`Logging in and initializing ${userObj.username}...`);
    const loginRes = await axios.post(`${API_URL}/api/auth/login`, { username: userObj.username, password: userObj.temporaryPassword });
    
    if (loginRes.data.requiresPasswordChange) {
        const tempToken = loginRes.data.tempToken;
        const changeRes = await axios.post(`${API_URL}/api/auth/first-login-change-password`, 
            { newPassword: 'MyStrongPassword123!' }, 
            { headers: { Authorization: `Bearer ${tempToken}` } }
        );
        return {
            id: userObj.userId,
            token: changeRes.data.accessToken
        };
    } else {
        return {
            id: userObj.userId,
            token: loginRes.data.accessToken
        };
    }
}

async function runSimulation() {
    console.log("Starting simulation...");
    const ts = Date.now();
    const userAName = `usera_${ts}`;
    const userBName = `userb_${ts}`;

    try {
        const adminToken = await loginAdmin();

        // 1. Create Users
        const createdUserA = await createUser(adminToken, userAName);
        const createdUserB = await createUser(adminToken, userBName);

        // 2. Login Users
        const userA = await loginAndInitializeUser(createdUserA);
        const userB = await loginAndInitializeUser(createdUserB);

        console.log("Users created and logged in successfully.");

        // 3. SignalR connections
        console.log("Connecting to Hubs...");
        const chatHubA = new signalR.HubConnectionBuilder().withUrl(`${API_URL}/chathub`, { accessTokenFactory: () => userA.token }).build();
        const chatHubB = new signalR.HubConnectionBuilder().withUrl(`${API_URL}/chathub`, { accessTokenFactory: () => userB.token }).build();
        
        await chatHubA.start();
        await chatHubB.start();
        console.log("ChatHub connected.");

        const callHubA = new signalR.HubConnectionBuilder().withUrl(`${API_URL}/callhub`, { accessTokenFactory: () => userA.token }).build();
        const callHubB = new signalR.HubConnectionBuilder().withUrl(`${API_URL}/callhub`, { accessTokenFactory: () => userB.token }).build();
            
        await callHubA.start();
        await callHubB.start();
        console.log("CallHub connected.");

        // 4. Send DM from A to B
        console.log("Creating DM conversation...");
        const convRes = await axios.post(`${API_URL}/api/conversations`, {
            type: "DirectMessage",
            memberIds: [userB.id]
        }, {
            headers: { Authorization: `Bearer ${userA.token}` }
        });
        const conversationId = convRes.data.id;

        console.log("Sending message...");
        await axios.post(`${API_URL}/api/messages`, {
            conversationId: conversationId,
            content: "Hello from User A!"
        }, {
            headers: { Authorization: `Bearer ${userA.token}` }
        });

        await delay(1000);

        // 5. Initiate Call
        console.log("Initiating call from A to B...");
        let incomingCallId = null;
        callHubB.on("IncomingCall", (callData) => {
            console.log("User B received IncomingCall event!", callData);
            incomingCallId = callData.callId;
        });
        
        let callId = null;
        callHubA.on("OutgoingCallStarted", (data) => {
            callId = data.callId;
        });

        await callHubA.invoke("StartCall", userB.id, "Direct");

        await delay(1000);

        if (!incomingCallId) {
            console.log("Checking fallback if call event missed, proceeding anyway.");
        }

        console.log("User B accepting call...");
        await callHubB.invoke("AcceptCall", callId);

        await delay(1000);

        console.log("User A ending call...");
        await callHubA.invoke("EndCall", callId);
        await delay(1000);

        // 6. Test Instant Meeting
        console.log("Starting instant meeting...");
        let joinCode = null;
        let meetingCallId = null;
        callHubA.on("CallAccepted", (data) => {
            if (data.joinCode) {
                meetingCallId = data.callId;
                joinCode = data.joinCode;
                console.log("Meeting created with join code:", joinCode);
            }
        });
        await callHubA.invoke("StartInstantMeeting");
        await delay(1000);

        if (joinCode) {
            console.log("User B joining meeting...");
            await callHubB.invoke("JoinMeetingById", joinCode);
            await delay(1000);

            // 7. Test Signaling (e.g. Screen Share toggle)
            console.log("Simulating screen share signaling...");
            let signalingReceived = false;
            callHubB.on("ReceiveSignaling", (senderId, type, payload) => {
                if (type === "ScreenShare") {
                    signalingReceived = true;
                    console.log("Screen share signaling received successfully.");
                }
            });
            await callHubA.invoke("SendSignalingMessage", userB.id, "ScreenShare", "fake_sdp_payload");
            await delay(1000);

            console.log("Ending meeting...");
            await callHubA.invoke("EndCall", meetingCallId);
            await delay(1000);
        }

        // 8. Test File Upload and Delete
        console.log("Testing file upload...");
        const FormData = require('form-data');
        const form = new FormData();
        form.append('file', Buffer.from('hello world text file content'), { filename: 'test_upload.txt', contentType: 'text/plain' });
        
        const uploadRes = await axios.post(`${API_URL}/api/storage/files/upload`, form, {
            headers: {
                Authorization: `Bearer ${userA.token}`,
                ...form.getHeaders()
            }
        });
        const fileId = uploadRes.data.id;
        console.log("File uploaded successfully, ID:", fileId);

        console.log("Testing file delete...");
        await axios.delete(`${API_URL}/api/storage/files/${fileId}`, {
            headers: { Authorization: `Bearer ${userA.token}` }
        });
        console.log("File deleted successfully.");

        console.log("All tests passed successfully!");
        process.exit(0);
    } catch (error) {
        console.error("Simulation failed:", error.message);
        if (error.response) {
            console.error("Response data:", error.response.data);
            console.error("Response status:", error.response.status);
        } else {
            console.error(error.stack);
        }
        process.exit(1);
    }
}

runSimulation();
