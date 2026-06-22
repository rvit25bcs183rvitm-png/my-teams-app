import React, { useState } from 'react';

const ConferenceRoomView = ({ meetingName = "Team Sync", participants = [] }) => {
  const [sidebarView, setSidebarView] = useState('chat'); // 'chat' | 'participants' | null
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);

  // Pad participants for a grid look if empty
  const gridParticipants = participants.length > 0 ? participants : [
    { displayName: 'Alice' }, { displayName: 'Bob' }, { displayName: 'Charlie' }, { displayName: 'Diana' }
  ];

  return (
    <div className="flex w-full h-screen bg-gray-900 text-gray-100 font-sans overflow-hidden">
      
      {/* Main Grid Area */}
      <div className="flex-1 flex flex-col relative">
        
        {/* Header */}
        <header className="flex items-center justify-between px-4 py-3 bg-gray-900 bg-opacity-95 absolute top-0 left-0 right-0 z-10 border-b border-gray-800 shadow-sm">
          <div className="flex items-center gap-3">
            <h1 className="text-white font-semibold text-base">{meetingName}</h1>
            <div className="px-2 py-0.5 bg-gray-800 border border-gray-700 text-xs font-semibold rounded text-gray-300 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>
              05:23
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              className={`btn text-sm p-2 rounded transition-colors ${sidebarView === 'participants' ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}
              onClick={() => setSidebarView(sidebarView === 'participants' ? null : 'participants')}
            >
              👥 People
            </button>
            <button 
              className={`btn text-sm p-2 rounded transition-colors ${sidebarView === 'chat' ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}
              onClick={() => setSidebarView(sidebarView === 'chat' ? null : 'chat')}
            >
              💬 Chat
            </button>
          </div>
        </header>

        {/* Video Grid */}
        <main className="flex-1 p-4 pt-16 pb-24 grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 overflow-y-auto content-center justify-center bg-black">
          {gridParticipants.map((p, i) => {
            const name = p?.displayName || p?.name || p?.username || `User ${i+1}`;
            return (
              <div key={i} className="aspect-video bg-gray-800 rounded-lg shadow-sm border border-gray-700 flex flex-col relative overflow-hidden group">
                <div className="flex-1 flex items-center justify-center">
                  <div className="w-16 h-16 rounded-full bg-brand-700 flex items-center justify-center text-xl font-medium shadow-inner text-white">
                    {name.charAt(0).toUpperCase()}
                  </div>
                </div>
                <div className="absolute bottom-2 left-2 bg-black bg-opacity-70 px-2 py-1 rounded text-xs text-white backdrop-blur-sm flex items-center gap-2">
                  {name}
                  {i % 3 === 0 && <span className="text-gray-400 text-[10px]">🎤</span>}
                </div>
              </div>
            );
          })}
        </main>

        {/* Control Bar (Pill) */}
        <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 flex items-center gap-1 bg-gray-800 bg-opacity-95 backdrop-blur-md px-2 py-2 rounded-lg shadow-2xl border border-gray-700">
          <button 
            className={`btn flex flex-col items-center justify-center p-2 rounded transition-colors min-w-[64px] ${isCameraOn ? 'text-white hover:bg-gray-700' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
            onClick={() => setIsCameraOn(!isCameraOn)}
          >
            <span className="text-lg">📷</span>
            <span className="text-[10px] mt-1 font-medium">Camera</span>
          </button>
          <button 
            className={`btn flex flex-col items-center justify-center p-2 rounded transition-colors min-w-[64px] ${isMuted ? 'text-gray-400 hover:text-white hover:bg-gray-700' : 'text-white hover:bg-gray-700'}`}
            onClick={() => setIsMuted(!isMuted)}
          >
            <span className="text-lg">🎤</span>
            <span className="text-[10px] mt-1 font-medium">Mic</span>
          </button>
          <button className="btn flex flex-col items-center justify-center p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors min-w-[64px]">
            <span className="text-lg">⬆️</span>
            <span className="text-[10px] mt-1 font-medium">Share</span>
          </button>
          
          <div className="w-px h-10 bg-gray-700 mx-2"></div>
          
          <button className="btn bg-red-600 hover:bg-red-700 text-white px-5 py-2 rounded-md text-sm font-semibold transition-colors shadow flex items-center justify-center ml-1 h-[42px]">
            Leave
          </button>
        </div>

      </div>

      {/* Sidebar */}
      {sidebarView && (
        <aside className="w-80 bg-white text-gray-900 border-l border-gray-200 flex flex-col shadow-2xl z-20 transition-all duration-300">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
            <h3 className="font-semibold text-sm text-gray-800">
              {sidebarView === 'chat' ? 'Meeting chat' : 'Participants'}
            </h3>
            <button 
              className="btn hover:bg-gray-100 p-1.5 rounded text-gray-500 transition-colors" 
              onClick={() => setSidebarView(null)}
            >
              ✕
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto bg-gray-50 p-4">
            {sidebarView === 'chat' ? (
              <div className="flex flex-col gap-4 text-sm">
                <div className="flex flex-col">
                  <span className="text-[11px] text-gray-500 mb-1 font-medium">Jane Smith • 10:02 AM</span>
                  <div className="bg-white border border-gray-200 p-2.5 rounded-lg rounded-tl-none w-fit text-gray-800 shadow-sm">
                    Hello everyone! Can you see my screen?
                  </div>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-[11px] text-gray-500 mb-1 font-medium">You • 10:03 AM</span>
                  <div className="bg-brand-100 border border-brand-200 p-2.5 rounded-lg rounded-tr-none w-fit text-brand-900 shadow-sm">
                    Yes, we can see it clearly.
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                {gridParticipants.map((p, i) => {
                  const name = p?.displayName || p?.name || p?.username || `User ${i+1}`;
                  return (
                    <div key={i} className="flex items-center gap-3 p-2 hover:bg-gray-100 rounded cursor-pointer transition-colors">
                      <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-medium text-xs">
                        {name.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-sm text-gray-800 font-medium flex-1">{name}</span>
                      {i % 3 === 0 && <span className="text-gray-400 text-xs">🎤</span>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          
          {sidebarView === 'chat' && (
            <div className="p-3 border-t border-gray-200 bg-white">
              <div className="flex items-center bg-gray-50 rounded border border-gray-300 focus-within:border-brand-500 focus-within:ring-1 focus-within:ring-brand-500 px-2 py-1.5 transition-all">
                <input 
                  type="text" 
                  placeholder="Type a new message" 
                  className="bg-transparent border-none outline-none flex-1 text-sm px-1 text-gray-900 placeholder-gray-500" 
                />
                <button className="btn text-brand-600 p-1.5 hover:bg-brand-50 rounded transition-colors">
                  ➤
                </button>
              </div>
            </div>
          )}
        </aside>
      )}
    </div>
  );
};

export default ConferenceRoomView;
