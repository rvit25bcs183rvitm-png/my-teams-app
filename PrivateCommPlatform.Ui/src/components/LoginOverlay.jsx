import { useState } from 'react';

function LoginOverlay({ onLoginSuccess, onLoginSubmit, onPasswordChangeSubmit }) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('AdminPassword123!');
  const [newPassword, setNewPassword] = useState('SecurePassword123!');
  const [loginError, setLoginError] = useState('');
  const [pwdChangeError, setPwdChangeError] = useState('');
  
  const [requiresPasswordChange, setRequiresPasswordChange] = useState(false);
  const [tempToken, setTempToken] = useState('');

  // Added states for modern features
  const [rememberMe, setRememberMe] = useState(localStorage.getItem("rememberMe") === "true");
  const [showPassword, setShowPassword] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    if (!username.trim() || !password.trim()) {
      setLoginError('Please fill in all credentials.');
      return;
    }

    try {
      const data = await onLoginSubmit(username, password);
      if (rememberMe) {
        localStorage.setItem("rememberMe", "true");
        localStorage.setItem("rememberedUsername", username);
      } else {
        localStorage.removeItem("rememberMe");
        localStorage.removeItem("rememberedUsername");
      }

      if (data?.requiresPasswordChange) {
        setTempToken(data?.tempToken || '');
        setRequiresPasswordChange(true);
      } else if (data) {
        onLoginSuccess(data?.accessToken || '', data?.refreshToken || '');
      }
    } catch (err) {
      setLoginError(err.message || 'Cannot connect to backend server. Make sure database service is running.');
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setPwdChangeError('');
    if (!newPassword.trim()) {
      setPwdChangeError('Password cannot be empty.');
      return;
    }

    try {
      const data = await onPasswordChangeSubmit(newPassword, tempToken);
      if (data) {
        onLoginSuccess(data?.accessToken || '', data?.refreshToken || '');
      }
    } catch (err) {
      setPwdChangeError(err.message || 'Password change failed.');
    }
  };

  const handleForgotPasswordSubmit = (e) => {
    e.preventDefault();
    if (!forgotEmail.trim()) {
      alert("Please enter your username or email address.");
      return;
    }
    setForgotSuccess("If your account is registered, a password reset request has been logged. Please contact your company's System Administrator to retrieve your temporary reset key.");
  };

  return (
    <div className="login-overlay" id="login-overlay">
      <div className="login-card">
        <div className="login-header">
          <i className="fa-solid fa-shield-halved"></i>
          <h1>SecureComm</h1>
          <p>Enterprise Cryptographic Communication</p>
        </div>

        {isForgotPassword ? (
          <form className="login-body" onSubmit={handleForgotPasswordSubmit}>
            <div className="form-group">
              <label htmlFor="forgot-email">Username or Email Address</label>
              <input
                type="text"
                id="forgot-email"
                value={forgotEmail || ''}
                onChange={(e) => setForgotEmail(e.target.value)}
                placeholder="username@domain.com"
                required
              />
            </div>
            
            {(forgotSuccess || '') && (
              <div className="login-error login-info">
                <i className="fa-solid fa-circle-info"></i>
                <span>{forgotSuccess || ''}</span>
              </div>
            )}
            
            <button type="submit" className="btn btn-primary login-submit-btn">
              Request Reset
            </button>
            
            <div className="form-group login-back-link-group">
              <span
                className="login-back-link"
                onClick={() => { setIsForgotPassword(false); setForgotSuccess(''); }}
              >
                Back to Authentication
              </span>
            </div>
          </form>
        ) : !requiresPasswordChange ? (
          <form className="login-body" id="login-form-pane" onSubmit={handleLogin}>
            <div className="form-group">
              <label htmlFor="login-username">Username</label>
              <input
                type="text"
                id="login-username"
                value={username || ''}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter secure username"
                required
              />
            </div>
            
            <div className="form-group">
              <div className="login-password-label-row">
                <label htmlFor="login-password">Password</label>
                <span
                  className="login-forgot-link"
                  onClick={() => setIsForgotPassword(true)}
                >
                  Forgot Password?
                </span>
              </div>
              <div className="login-password-wrapper">
                <input
                  type={showPassword ? "text" : "password"}
                  id="login-password"
                  className="login-password-input"
                  value={password || ''}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter secure password"
                  required
                />
                <i
                  className={`fa-solid ${showPassword ? 'fa-eye-slash' : 'fa-eye'} login-password-toggle`}
                  onClick={() => setShowPassword(!showPassword)}
                ></i>
              </div>
            </div>

            <div className="login-remember-me">
              <input
                type="checkbox"
                id="remember-me-chk"
                className="login-remember-checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              <label htmlFor="remember-me-chk" className="login-remember-label">
                Remember username on this terminal
              </label>
            </div>

            {(loginError || '') && (
              <div className="login-error" id="login-error-msg">
                <i className="fa-solid fa-circle-exclamation"></i>
                <span>{loginError || ''}</span>
              </div>
            )}
            
            <button type="submit" className="btn btn-primary login-submit-btn" id="btn-login-submit">
              Authenticate Secure Session
            </button>
          </form>
        ) : (
          <form className="login-body" id="password-change-pane" onSubmit={handlePasswordChange}>
            <div className="login-error login-warning">
              <i className="fa-solid fa-triangle-exclamation"></i>
              <span>First-time login detected. You must change your temporary password to a permanent secure one.</span>
            </div>
            
            <div className="form-group">
              <label htmlFor="new-permanent-password">New Permanent Password</label>
              <div className="login-password-wrapper">
                <input
                  type={showPassword ? "text" : "password"}
                  id="new-permanent-password"
                  className="login-password-input"
                  value={newPassword || ''}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 12 characters, uppercase, number, symbol"
                  required
                />
                <i
                  className={`fa-solid ${showPassword ? 'fa-eye-slash' : 'fa-eye'} login-password-toggle`}
                  onClick={() => setShowPassword(!showPassword)}
                ></i>
              </div>
            </div>
            
            {(pwdChangeError || '') && (
              <div className="login-error" id="pwd-change-error-msg">
                <i className="fa-solid fa-circle-exclamation"></i>
                <span>{pwdChangeError || ''}</span>
              </div>
            )}
            
            <button type="submit" className="btn btn-primary login-submit-btn" id="btn-pwd-change-submit">
              Establish Active Status
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default LoginOverlay;
