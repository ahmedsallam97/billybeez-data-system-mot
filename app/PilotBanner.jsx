import styles from './PilotBanner.module.css';

export default function PilotBanner() {
  if (process.env.NEXT_PUBLIC_DEPLOYMENT_STAGE !== 'pilot') return null;
  return <aside className={styles.banner} role="status" aria-label="Supervised pilot environment">PILOT · Test data copy · نسخة تجريبية</aside>;
}
