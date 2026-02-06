import { GoogleLogin } from '@react-oauth/google';
import { useAuth } from '../../contexts/AuthContext';
import styles from './Login.module.css';

export default function Login() {
  const { login } = useAuth();

  async function handleSuccess(credentialResponse: { credential?: string }) {
    if (!credentialResponse.credential) return;
    try {
      await login(credentialResponse.credential);
    } catch (error) {
      console.error('Login error:', error);
      alert('Login failed. Please try again.');
    }
  }

  function handleError() {
    console.error('Google Sign-In failed');
    alert('Login failed. Please try again.');
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1>Yearly Planner</h1>
        <p className={styles.subtitle}>Sign in to access your shared calendar</p>
        <div className={styles.buttonContainer}>
          <GoogleLogin
            onSuccess={handleSuccess}
            onError={handleError}
            useOneTap={false}
          />
        </div>
      </div>
    </div>
  );
}
