import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, BookOpen, CheckCircle2, Eye, EyeOff, LoaderCircle, LockKeyhole, Mail, UserRound, X } from 'lucide-react';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { returnToOriginAfterAuth } from '../../utils/postAuthNavigation';

const EMPTY_FORM = { fullName: '', email: '', phone: '', password: '', confirmPassword: '' };

export default function AuthModal() {
  const { signIn } = useAuth();
  // Remember the view that opened authentication, not the dashboard.
  // Keeping the same route also preserves the selected book / subject modal.
  const originHash = useRef('');
  const [mode, setMode] = useState('login');
  const [open, setOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState({ type: '', text: '' });
  const [form, setForm] = useState(EMPTY_FORM);
  const [code, setCode] = useState('');
  const [resetToken, setResetToken] = useState('');
  // The request reply is intentionally identical for existing and unknown emails.
  // It only enables an option to enter a code; it does not confirm registration.
  const [resetRequestedFor, setResetRequestedFor] = useState('');

  useEffect(() => {
    const openModal = (event) => {
      originHash.current = window.location.hash;
      setMode(event.detail?.mode === 'register' ? 'register' : 'login');
      setForm(EMPTY_FORM); setCode(''); setResetToken(''); setResetRequestedFor('');
      setShowPassword(false); setNotice({ type: '', text: '' }); setOpen(true);
    };
    window.addEventListener('openshelf:auth-request', openModal);
    return () => window.removeEventListener('openshelf:auth-request', openModal);
  }, []);

  const update = (event) => {
    // Changing the email starts a new reset attempt; do not reuse the old code.
    if (event.target.name === 'email') {
      setResetRequestedFor('');
      setCode('');
      setResetToken('');
    }
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  };
  const switchMode = (next) => {
    setMode(next); setNotice({ type: '', text: '' }); setCode(''); setResetToken(''); setResetRequestedFor('');
    setForm((current) => ({ ...current, password: '', confirmPassword: '' }));
  };
  const close = () => { setOpen(false); setResetToken(''); setCode(''); setResetRequestedFor(''); setForm(EMPTY_FORM); };

  async function submit(event) {
    event.preventDefault(); setBusy(true); setNotice({ type: '', text: '' });
    try {
      if (mode === 'register') {
        const { data } = await api.post('/api/auth/register/start', form, { timeout: 45000 });
        setMode('register-email'); setCode(''); setNotice({ type: 'success', text: data.message });
        return;
      }
      if (mode === 'register-email') {
        const { data } = await api.post('/api/auth/register/verify-email', { email: form.email, code }, { timeout: 45000 });
        signIn(data); close(); returnToOriginAfterAuth(originHash.current, data.user.role);
        return;
      }
      if (mode === 'forgot') {
        const { data } = await api.post('/api/auth/password/forgot', { email: form.email }, { timeout: 45000 });
        // Do not automatically open the OTP form: an unknown email also gets
        // the same generic response, but no code is sent and reset is blocked.
        setResetRequestedFor(form.email.trim().toLowerCase());
        setNotice({ type: 'success', text: data.message });
        return;
      }
      if (mode === 'verify') {
        const { data } = await api.post('/api/auth/password/verify', { email: form.email, code }, { timeout: 45000 });
        setResetToken(data.resetToken); setCode(''); setMode('reset');
        setNotice({ type: 'success', text: data.message });
        return;
      }
      if (mode === 'reset') {
        const { data } = await api.post('/api/auth/password/reset', {
          email: form.email, resetToken, newPassword: form.password, confirmPassword: form.confirmPassword
        }, { timeout: 45000 });
        setResetToken(''); setCode(''); setResetRequestedFor(''); setForm((current) => ({ ...current, password: '', confirmPassword: '' }));
        setMode('login'); setNotice({ type: 'success', text: data.message });
        return;
      }
      const { data } = await api.post('/api/auth/login', { email: form.email, password: form.password }, { timeout: 45000 });
      signIn(data);
      close();
      returnToOriginAfterAuth(originHash.current, data.user.role);
    } catch (error) {
      setNotice({ type: 'error', text: error.response?.data?.message || 'Unable to connect. Check that the OpenShelf API is running.' });
    } finally { setBusy(false); }
  }

  async function resendRegistrationCode() {
    setBusy(true); setNotice({ type: '', text: '' });
    try {
      const { data } = await api.post('/api/auth/register/start', form, { timeout: 45000 });
      setCode(''); setNotice({ type: 'success', text: data.message });
    } catch (error) {
      setNotice({ type: 'error', text: error.response?.data?.message || 'Could not resend the email code. Try again later.' });
    } finally { setBusy(false); }
  }

  async function resendCode() {
    setBusy(true); setNotice({ type: '', text: '' });
    try {
      const { data } = await api.post('/api/auth/password/forgot', { email: form.email }, { timeout: 45000 });
      setNotice({ type: 'success', text: `${data.message} A resend is limited to once per 60 seconds.` });
    } catch (error) {
      setNotice({ type: 'error', text: error.response?.data?.message || 'Could not request another code. Try again later.' });
    } finally { setBusy(false); }
  }

  const headings = {
    login: ['Welcome back.', 'Sign in to continue your reading journey.'],
    register: ['Create your account.', 'Provide a 10-digit contact number and verify your email using a six-digit code. Different accounts may share a phone number.'],
    'register-email': ['Verify your email.', 'Enter the six-digit code we sent to your email to create your account. Phone verification is not required.'],
    forgot: ['Forgot your password?', 'Only active registered student accounts can reset passwords. Enter your registered email to request a six-digit code.'],
    verify: ['Enter your verification code.', 'Enter the six-digit code from your registered email. Codes expire after 10 minutes.'],
    reset: ['Choose a new password.', 'Your code is verified. Set a new password to secure your account.']
  };

  return createPortal(<AnimatePresence>{open && <motion.div className="auth-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
    <motion.section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title" initial={{ opacity: 0, y: 24, scale: .97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16, scale: .98 }} transition={{ duration: .22 }}>
      <button className="auth-close" aria-label="Close authentication" onClick={close}><X size={19}/></button>
      <div className="auth-brand"><span><BookOpen size={22}/></span><div><strong>OpenShelf</strong><small>DISCOVER. BORROW. READ. GROW.</small></div></div>
      <div className="auth-kicker">YOUR NEXT CHAPTER STARTS HERE</div>
      <h2 id="auth-title">{headings[mode][0]}</h2>
      <p className="auth-subtitle">{headings[mode][1]}</p>
      <form onSubmit={submit} className="auth-form">
        {mode === 'register' && <label><span>Full name</span><div className="auth-input"><UserRound size={17}/><input name="fullName" value={form.fullName} onChange={update} placeholder="Your full name" autoComplete="name" required minLength={2} maxLength={80}/></div></label>}
        {mode === 'register' && <label><span>10-digit mobile number (India)</span><div className="auth-input"><input type="tel" name="phone" value={form.phone} onChange={(event) => setForm((old) => ({ ...old, phone: event.target.value.replace(/\D/g, '').slice(0, 10) }))} placeholder="9876543210" inputMode="numeric" autoComplete="tel-national" pattern="[6-9][0-9]{9}" maxLength={10} required /></div><small>A contact number for library administration; not verified by SMS and not used for login. Multiple accounts may use the same number.</small></label>}
        {['login', 'register', 'forgot'].includes(mode) && <label><span>Registered email address</span><div className="auth-input"><Mail size={17}/><input type="email" name="email" value={form.email} onChange={update} placeholder="you@gmail.com" autoComplete="email" required maxLength={254}/></div></label>}
        {mode === 'register-email' && <><p className="auth-email-note">Verification code requested for <strong>{form.email}</strong>. Check your inbox and spam folder.</p><label><span>Six-digit email OTP</span><div className="auth-input"><LockKeyhole size={17}/><input inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" required /></div></label></>}
        {mode === 'verify' && <><p className="auth-email-note">Verification code sent if an eligible account exists for <strong>{form.email}</strong>.</p><label><span>Six-digit verification code</span><div className="auth-input"><LockKeyhole size={17}/><input name="otp" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" required/></div></label></>}
        {['login', 'register', 'reset'].includes(mode) && <label><span>{mode === 'reset' ? 'New password' : 'Password'}</span><div className="auth-input"><LockKeyhole size={17}/><input type={showPassword ? 'text' : 'password'} name="password" value={form.password} onChange={update} placeholder="At least 8 characters" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={8} maxLength={72} required/><button type="button" className="password-toggle" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={17}/> : <Eye size={17}/>}</button></div></label>}
        {['register', 'reset'].includes(mode) && <label><span>Confirm {mode === 'reset' ? 'new ' : ''}password</span><div className="auth-input"><LockKeyhole size={17}/><input type="password" name="confirmPassword" value={form.confirmPassword} onChange={update} placeholder="Enter your password again" autoComplete="new-password" minLength={8} maxLength={72} required/></div></label>}
        {mode === 'login' && <div className="auth-forgot-row"><button type="button" onClick={() => switchMode('forgot')}>Forgot password?</button></div>}
        {notice.text && <div className={`auth-notice ${notice.type}`} role="status">{notice.type === 'success' && <CheckCircle2 size={17}/>}<span>{notice.text}</span></div>}
        <button className="auth-submit" disabled={busy} type="submit">{busy ? <LoaderCircle className="auth-spinner" size={18}/> : <>{({ login: 'Sign in', register: 'Send email OTP', 'register-email': 'Verify email & create account', forgot: 'Send code', verify: 'Verify code', reset: 'Reset password' })[mode]} <ArrowRight size={17}/></>}</button>
      </form>
      {mode === 'forgot' && resetRequestedFor === form.email.trim().toLowerCase() && (
        <div className="auth-switch">
          Received a six-digit email code?{' '}
          <button type="button" disabled={busy} onClick={() => { setMode('verify'); setNotice({ type: '', text: '' }); }}>
            I received a code
          </button>
        </div>
      )}
      {mode === 'forgot' && (
        <div className="auth-switch">
          No code? Check the email address and spam folder, or{' '}
          <button type="button" disabled={busy} onClick={() => switchMode('register')}>
            create an account
          </button>.
        </div>
      )}
      {mode === 'register-email' && <div className="auth-switch">Didn't receive the email? <button type="button" disabled={busy} onClick={resendRegistrationCode}>Resend code (60s cooldown)</button></div>}
      {mode === 'verify' && <div className="auth-switch">Didn't receive a code? <button type="button" disabled={busy} onClick={resendCode}>Resend code</button></div>}
      {['login', 'register'].includes(mode) ? <div className="auth-switch">{mode === 'register' ? 'Already have an account?' : 'New to OpenShelf?'} <button onClick={() => switchMode(mode === 'register' ? 'login' : 'register')}>{mode === 'register' ? 'Sign in' : 'Create an account'}</button></div> : <div className="auth-switch"><button type="button" onClick={() => switchMode('login')}><ArrowLeft size={14} style={{ verticalAlign: 'middle' }}/> Back to login</button></div>}
      <div className="auth-security"><LockKeyhole size={13}/> We never ask you to share your verification code.</div>
    </motion.section>
  </motion.div>}</AnimatePresence>, document.body);
}
