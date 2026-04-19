type StatCardProps = {
  label: string;
  value: string;
  accent?: 'gold' | 'green' | 'red' | 'blue';
};

export function StatCard({ label, value, accent = 'gold' }: StatCardProps) {
  return (
    <article className={`stat-card stat-card--${accent}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

