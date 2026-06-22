import React, { useState, useEffect } from 'react';
import { CreditCard, CheckCircle2, Shield, Zap, Globe } from 'lucide-react';
import { BASE_URL } from '../config';

const BillingSection = ({ token, currentUser }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [transactionsLoading, setTransactionsLoading] = useState(false);

  useEffect(() => {
    const fetchTransactions = async () => {
      setTransactionsLoading(true);
      try {
        const response = await fetch(`${BASE_URL}/api/billing/transactions`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        if (response.ok) {
          const data = await response.json();
          setTransactions(data);
        }
      } catch (err) {
        console.error("Error fetching transactions:", err);
      } finally {
        setTransactionsLoading(false);
      }
    };
    if (token) {
      fetchTransactions();
    }
  }, [token]);

  const loadRazorpayScript = () => {
    return new Promise((resolve) => {
      if (window.Razorpay) {
        resolve(true);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const handleSubscribe = async (planId) => {
    setLoading(true);
    setError(null);
    try {
      const isLoaded = await loadRazorpayScript();
      if (!isLoaded) {
        throw new Error('Razorpay SDK failed to load. Are you online?');
      }

      const response = await fetch(`${BASE_URL}/api/billing/create-checkout-session`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ planId })
      });

      if (!response.ok) {
        let errorMessage = 'Failed to initialize checkout';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          errorMessage = `Server Error (${response.status})`;
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      
      const options = {
        key: 'rzp_test_T4aeTs4ErU97dN', // Hardcoded here or fetch from backend
        amount: data.amount,
        currency: data.currency,
        name: 'PrivateComm',
        description: 'Plan Upgrade',
        order_id: data.orderId,
        handler: async function (response) {
          try {
            const verifyRes = await fetch(`${BASE_URL}/api/billing/verify-payment`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
                planId: planId
              })
            });
            if (verifyRes.ok) {
              window.location.reload();
            } else {
              setError("Payment verification failed. Please contact support.");
            }
          } catch(err) {
            setError("Error verifying payment.");
          }
        },
        prefill: {
          name: currentUser?.firstName ? `${currentUser.firstName} ${currentUser.lastName}` : '',
          email: currentUser?.email || ''
        },
        theme: {
          color: '#10b981'
        }
      };

      const rzp1 = new window.Razorpay(options);
      rzp1.on('payment.failed', function (response){
        setError(`Payment Failed: ${response.error.description}`);
      });
      rzp1.open();

    } catch (err) {
      console.error('Checkout error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const isPro = currentUser?.subscriptionPlan === 'BusinessPro';

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', animation: 'fadeIn 0.3s ease' }}>
      
      {/* Current Subscription Timeline Card */}
      {currentUser?.subscriptionPlan !== 'Free' && (
        <div style={{
          background: 'rgba(16, 185, 129, 0.05)',
          border: '1px solid var(--primary)',
          borderRadius: '16px',
          padding: '24px',
          marginBottom: '32px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
          boxShadow: '0 4px 20px rgba(16, 185, 129, 0.05)'
        }}>
          <div>
            <h4 style={{ color: 'var(--primary)', fontWeight: 700, margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CheckCircle2 size={18} /> Active Subscription Timeline
            </h4>
            <p style={{ color: 'var(--text-primary)', fontSize: '1.1rem', fontWeight: 600, margin: '8px 0 4px 0' }}>
              Plan: {currentUser?.subscriptionPlan === 'BusinessPro' ? 'Business Pro' : 'Pro'}
            </p>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', gap: '16px', flexWrap: 'wrap', marginTop: '8px' }}>
              <span>Start Date: {currentUser?.subscriptionStartDate ? new Date(currentUser.subscriptionStartDate).toLocaleDateString() : 'N/A'}</span>
              <span>Expiration Date: {currentUser?.subscriptionEndDate ? new Date(currentUser.subscriptionEndDate).toLocaleDateString() : 'N/A'}</span>
            </div>
          </div>
          <div style={{
            background: 'var(--primary)',
            color: '#fff',
            padding: '6px 16px',
            borderRadius: '20px',
            fontSize: '0.85rem',
            fontWeight: 700
          }}>
            Status: {currentUser?.subscriptionStatus || 'Active'}
          </div>
        </div>
      )}

      <div style={{ textAlign: 'center', marginBottom: '40px' }}>
        <h2 style={{ fontSize: '2.2rem', fontWeight: 800, marginBottom: '12px', background: 'linear-gradient(135deg, var(--primary) 0%, var(--accent-blue) 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          Upgrade Your Communication
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem', maxWidth: '600px', margin: '0 auto' }}>
          Choose the right plan for your team. Enjoy crystal clear calls, unlimited messaging, and enterprise-grade security.
        </p>
      </div>

      {error && (
        <div style={{ padding: '16px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--secondary)', borderRadius: '12px', color: '#ff8a8a', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <i className="fa-solid fa-triangle-exclamation"></i>
          <span>{error}</span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '24px' }}>
        
        {/* Free Tier Card */}
        <div style={{ 
          background: 'var(--bg-card)', 
          border: '1px solid var(--border-color)', 
          borderRadius: '16px', 
          padding: '32px', 
          display: 'flex', 
          flexDirection: 'column',
          position: 'relative',
          transition: 'transform 0.2s, box-shadow 0.2s',
          boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
        }}>
          <h3 style={{ fontSize: '1.4rem', fontWeight: 700, margin: '0 0 8px 0', color: 'var(--text-primary)' }}>Free Tier</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '24px' }}>Perfect for personal use and small groups.</p>
          
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginBottom: '32px' }}>
            <span style={{ fontSize: '2.5rem', fontWeight: 800 }}>$0</span>
            <span style={{ color: 'var(--text-muted)' }}>/month</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1, marginBottom: '32px' }}>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', color: 'var(--text-secondary)' }}>
              <CheckCircle2 size={20} color="var(--primary)" />
              <span>Up to 40 Voice/Video calls per month</span>
            </div>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', color: 'var(--text-secondary)' }}>
              <CheckCircle2 size={20} color="var(--primary)" />
              <span>Unlimited 1:1 and Group Messaging</span>
            </div>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', color: 'var(--text-secondary)' }}>
              <CheckCircle2 size={20} color="var(--primary)" />
              <span>Standard file sharing (up to 10MB)</span>
            </div>
          </div>

          <button 
            disabled={true}
            style={{
              padding: '12px 24px',
              borderRadius: '8px',
              fontWeight: 600,
              fontSize: '1rem',
              background: 'var(--bg-hover)',
              color: 'var(--text-muted)',
              border: '1px solid var(--border-color)',
              cursor: 'not-allowed',
              width: '100%'
            }}
          >
            {isPro || currentUser?.subscriptionPlan === 'UsageBased' ? 'Downgrade' : 'Current Plan'}
          </button>
        </div>

        {/* Pro Tier Card */}
        <div style={{ 
          background: 'var(--bg-card)', 
          border: '1px solid var(--border-color)', 
          borderRadius: '16px', 
          padding: '32px', 
          display: 'flex', 
          flexDirection: 'column',
          position: 'relative',
          transition: 'transform 0.2s, box-shadow 0.2s',
          boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
        }}>
          <h3 style={{ fontSize: '1.4rem', fontWeight: 700, margin: '0 0 8px 0', color: 'var(--text-primary)' }}>Pro</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '24px' }}>Essential tools for growing teams.</p>
          
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginBottom: '32px' }}>
            <span style={{ fontSize: '2.5rem', fontWeight: 800 }}>$5</span>
            <span style={{ color: 'var(--text-muted)' }}>/month per user</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1, marginBottom: '32px' }}>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', color: 'var(--text-secondary)' }}>
              <Zap size={20} color="var(--primary)" />
              <span>Unlimited Voice & Video Calls</span>
            </div>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', color: 'var(--text-secondary)' }}>
              <Globe size={20} color="var(--primary)" />
              <span>Localized Pricing</span>
            </div>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', color: 'var(--text-secondary)' }}>
              <CheckCircle2 size={20} color="var(--primary)" />
              <span>Standard file sharing (up to 100MB)</span>
            </div>
          </div>

          <button 
            onClick={() => handleSubscribe('usage')}
            disabled={loading || currentUser?.subscriptionPlan === 'UsageBased' || isPro}
            className="btn btn-secondary"
            style={{
              padding: '12px 24px',
              borderRadius: '8px',
              fontWeight: 700,
              fontSize: '1.05rem',
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              background: 'var(--bg-elevated)',
              color: '#fff',
              border: '1px solid var(--border-strong)',
              opacity: (loading || currentUser?.subscriptionPlan === 'UsageBased' || isPro) ? 0.7 : 1,
              cursor: (loading || currentUser?.subscriptionPlan === 'UsageBased' || isPro) ? 'not-allowed' : 'pointer'
            }}
          >
            {loading ? <i className="fa-solid fa-circle-notch fa-spin"></i> : <CreditCard size={18} />}
            {currentUser?.subscriptionPlan === 'UsageBased' ? 'Current Plan' : (isPro ? 'Downgrade' : 'Upgrade to Pro')}
          </button>
        </div>

        {/* Pro Tier Card */}
        <div style={{ 
          background: 'linear-gradient(180deg, var(--bg-card) 0%, rgba(99, 102, 241, 0.05) 100%)',
          border: '1px solid var(--primary)', 
          borderRadius: '16px', 
          padding: '32px', 
          display: 'flex', 
          flexDirection: 'column',
          position: 'relative',
          boxShadow: '0 8px 30px rgba(99, 102, 241, 0.15)'
        }}>
          <div style={{ position: 'absolute', top: '-12px', right: '32px', background: 'var(--primary)', color: '#fff', padding: '4px 12px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 800, letterSpacing: '1px' }}>
            RECOMMENDED
          </div>
          
          <h3 style={{ fontSize: '1.4rem', fontWeight: 700, margin: '0 0 8px 0', color: 'var(--text-primary)' }}>Business Pro</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '24px' }}>For teams that need unrestricted power and admin controls.</p>
          
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginBottom: '32px' }}>
            <span style={{ fontSize: '2.5rem', fontWeight: 800 }}>$15</span>
            <span style={{ color: 'var(--text-muted)' }}>/month per user</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1, marginBottom: '32px' }}>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', color: 'var(--text-secondary)' }}>
              <Globe size={20} color="var(--primary)" />
              <span>Pricing localized to your region</span>
            </div>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', color: 'var(--text-secondary)' }}>
              <Zap size={20} color="var(--primary)" />
              <span>Unlimited Voice & Video Calls</span>
            </div>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', color: 'var(--text-secondary)' }}>
              <Shield size={20} color="var(--primary)" />
              <span>Advanced Admin & Compliance Logs</span>
            </div>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', color: 'var(--text-secondary)' }}>
              <CheckCircle2 size={20} color="var(--primary)" />
              <span>Large file sharing (up to 1GB)</span>
            </div>
          </div>

          <button 
            onClick={() => handleSubscribe('business')}
            disabled={loading || isPro}
            className="btn btn-primary"
            style={{
              padding: '14px 24px',
              borderRadius: '8px',
              fontWeight: 700,
              fontSize: '1.05rem',
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              opacity: (loading || isPro) ? 0.7 : 1,
              cursor: (loading || isPro) ? 'not-allowed' : 'pointer'
            }}
          >
            {loading ? (
              <i className="fa-solid fa-circle-notch fa-spin"></i>
            ) : (
              <CreditCard size={18} />
            )}
            {isPro ? 'Already Pro' : 'Upgrade to Pro'}
          </button>
        </div>

      </div>

      {/* Transaction History Section */}
      <div style={{ marginTop: '48px', borderTop: '1px solid var(--border-color)', paddingTop: '32px' }}>
        <h3 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '16px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CreditCard size={20} /> Billing & Payment History
        </h3>
        
        {transactionsLoading ? (
          <p style={{ color: 'var(--text-muted)' }}>Loading transactions...</p>
        ) : transactions.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontStyle: 'italic' }}>No billing transactions found.</p>
        ) : (
          <div style={{ overflowX: 'auto', borderRadius: '12px', border: '1px solid var(--border-color)', background: 'var(--bg-card)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ background: 'var(--bg-hover)', borderBottom: '1px solid var(--border-color)' }}>
                  <th style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>Order ID</th>
                  <th style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>Payment ID</th>
                  <th style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>Plan</th>
                  <th style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>Amount</th>
                  <th style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>Status</th>
                  <th style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>Date</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => (
                  <tr key={tx.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '12px 16px', fontFamily: 'monospace', color: 'var(--text-primary)' }}>{tx.razorpayOrderId}</td>
                    <td style={{ padding: '12px 16px', fontFamily: 'monospace', color: 'var(--text-muted)' }}>{tx.razorpayPaymentId || 'N/A'}</td>
                    <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {tx.planId === 'business' ? 'Business Pro' : 'Pro'}
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-primary)' }}>
                      {tx.currency} {tx.amount.toFixed(2)}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{
                        padding: '4px 8px',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        background: tx.status === 'Success' ? 'rgba(16, 185, 129, 0.15)' : tx.status === 'Failed' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                        color: tx.status === 'Success' ? '#10b981' : tx.status === 'Failed' ? '#ef4444' : '#f59e0b'
                      }}>
                        {tx.status}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>
                      {new Date(tx.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
};

export default BillingSection;
