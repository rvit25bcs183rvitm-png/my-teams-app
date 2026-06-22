import React, { useState } from 'react';

const ActiveCallOverlay = ({ participant, onHangup }) => {
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);

  const displayName = participant?.displayName || participant?.name || participant?.username || 'Unknown User';
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900 bg-opacity-95 backdrop-blur-sm">
      <div className="relative flex flex-col items-center justify-center w-full h-full max-w-5xl max-h-[85vh] rounded-xl overflow-hidden bg-black text-white shadow-2xl border border-gray-800">
        
        {/* Main View Area */}
        <div className="flex-1 flex flex-col items-center justify-center w-full">
          {isCameraOn ? (
            <div className="w-full h-full bg-gray-800 flex items-center justify-center text-gray-400">
              Camera Feed Active
            </div>
          ) : (
            <div className="flex flex-col items-center gap-6">
              <div className="w-32 h-32 rounded-full bg-brand-700 flex items-center justify-center text-5xl font-light shadow-lg">
                {initial}
              </div>
              <div className="flex flex-col items-center gap-1">
                <h2 className="text-2xl font-semibold tracking-wide">{displayName}</h2>
                <span className="text-sm text-gray-400 font-medium">00:15</span>
              </div>
            </div>
          )}
        </div>

        {/* Floating Control Pill */}
        <div className="absolute bottom-8 flex items-center gap-3 bg-gray-800 bg-opacity-90 backdrop-blur-md px-6 py-3 rounded-full shadow-lg border border-gray-700">
          <button
            className={`btn w-12 h-12 rounded-full flex items-center justify-center transition-colors ${isCameraOn ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-transparent hover:bg-gray-700 text-gray-300'}`}
            onClick={() => setIsCameraOn(!isCameraOn)}
            title="Toggle Camera"
          >
            <span className="icon">📷</span>
          </button>
          
          <button
            className={`btn w-12 h-12 rounded-full flex items-center justify-center transition-colors ${isMuted ? 'bg-gray-700 hover:bg-gray-600 text-gray-400' : 'bg-transparent hover:bg-gray-700 text-white'}`}
            onClick={() => setIsMuted(!isMuted)}
            title="Toggle Mute"
          >
            <span className="icon">🎤</span>
          </button>

          <div className="w-px h-8 bg-gray-600 mx-2"></div>

          <button
            className="btn bg-red-600 hover:bg-red-700 text-white rounded-full px-6 py-2.5 font-semibold text-sm transition-colors shadow-md"
            onClick={onHangup}
            title="Hang Up"
          >
            Leave
          </button>
        </div>

      </div>
    </div>
  );
};

export default ActiveCallOverlay;
