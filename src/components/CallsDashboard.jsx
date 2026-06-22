import React, { useState } from 'react';

const CallsDashboard = ({ history = [], contacts = [] }) => {
  const [activeTab, setActiveTab] = useState('History');

  return (
    <div className="flex flex-col h-full bg-white text-gray-900 font-sans">
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <div className="flex space-x-6">
          <button 
            className={`text-sm font-semibold pb-1 border-b-2 transition-colors ${activeTab === 'History' ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-600 hover:text-gray-900'}`}
            onClick={() => setActiveTab('History')}
          >
            History
          </button>
          <button 
            className={`text-sm font-semibold pb-1 border-b-2 transition-colors ${activeTab === 'Contacts' ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-600 hover:text-gray-900'}`}
            onClick={() => setActiveTab('Contacts')}
          >
            Contacts
          </button>
        </div>
        <button className="btn btn-primary bg-brand-600 text-white text-sm font-semibold px-4 py-1.5 rounded shadow-sm hover:bg-brand-700 transition-colors">
          Dialpad
        </button>
      </header>
      <main className="flex-1 overflow-y-auto p-2">
        {activeTab === 'History' && (
          <div className="flex flex-col">
            {history.length === 0 ? (
              <div className="p-4 text-sm text-gray-500 text-center">No recent calls</div>
            ) : (
              history.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between p-2 hover:bg-gray-100 rounded-md cursor-pointer group transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="avatar w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-semibold text-sm">
                      {(item?.name || item?.displayName || item?.username || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold text-gray-900">{item?.name || item?.displayName || item?.username || 'Unknown'}</span>
                      <span className="text-xs text-gray-500">{item?.type || 'Incoming'} • {item?.time || 'Just now'}</span>
                    </div>
                  </div>
                  <button className="opacity-0 group-hover:opacity-100 text-brand-600 hover:bg-brand-100 p-2 rounded-full transition-all">
                    Call
                  </button>
                </div>
              ))
            )}
          </div>
        )}
        {activeTab === 'Contacts' && (
          <div className="flex flex-col">
            {contacts.length === 0 ? (
              <div className="p-4 text-sm text-gray-500 text-center">No contacts found</div>
            ) : (
              contacts.map((contact, idx) => (
                <div key={idx} className="flex items-center gap-3 p-2 hover:bg-gray-100 rounded-md cursor-pointer transition-colors">
                  <div className="avatar w-10 h-10 rounded-full bg-gray-200 text-gray-700 flex items-center justify-center font-semibold text-sm">
                    {(contact?.name || contact?.displayName || contact?.username || '?').charAt(0).toUpperCase()}
                  </div>
                  <span className="text-sm font-semibold text-gray-900 flex-1">{contact?.name || contact?.displayName || contact?.username || 'Unknown'}</span>
                </div>
              ))
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default CallsDashboard;
