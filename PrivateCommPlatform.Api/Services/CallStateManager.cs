using System;
using System.Collections.Concurrent;
using System.Collections.Generic;

namespace PrivateCommPlatform.Api.Services
{
    public interface ICallStateManager
    {
        bool TryTransition(Guid callId, string fromState, string toState);
        void SetState(Guid callId, string state);
        string GetState(Guid callId);
        void RemoveCall(Guid callId);
    }

    public class CallStateManager : ICallStateManager
    {
        private readonly ConcurrentDictionary<Guid, string> _callStates = new();

        // Defines valid transitions. Key: From state, Value: Allowed To states
        private readonly Dictionary<string, HashSet<string>> _validTransitions = new()
        {
            { "Initiated", new HashSet<string> { "Ringing", "Connected", "Cancelled", "Failed" } },
            { "Ringing", new HashSet<string> { "Connected", "Rejected", "Busy", "Cancelled", "Failed" } },
            { "Connected", new HashSet<string> { "Completed", "Failed" } },
            { "Rejected", new HashSet<string>() }, // Terminal state
            { "Busy", new HashSet<string>() },     // Terminal state
            { "Cancelled", new HashSet<string>() },// Terminal state
            { "Completed", new HashSet<string>() },// Terminal state
            { "Failed", new HashSet<string>() }    // Terminal state
        };

        public bool TryTransition(Guid callId, string fromState, string toState)
        {
            var currentState = _callStates.GetOrAdd(callId, "Initiated");

            if (currentState != fromState)
            {
                return false;
            }

            if (_validTransitions.TryGetValue(currentState, out var allowedToStates) && allowedToStates.Contains(toState))
            {
                // Note: In a concurrent environment, this is a race condition.
                // For a robust implementation, TryUpdate should be used.
                if (_callStates.TryUpdate(callId, toState, currentState))
                {
                    return true;
                }
            }
            
            return false;
        }

        public void SetState(Guid callId, string state)
        {
            _callStates.AddOrUpdate(callId, state, (_, _) => state);
        }

        public string GetState(Guid callId)
        {
            return _callStates.TryGetValue(callId, out var state) ? state : "Unknown";
        }

        public void RemoveCall(Guid callId)
        {
            _callStates.TryRemove(callId, out _);
        }
    }
}
