import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <section className="status-page" aria-labelledby="not-found-title">
      <p className="status-page__eyebrow">导航提示</p>
      <h1 id="not-found-title">页面未找到</h1>
      <p>请检查地址，或返回仪表盘继续工作。</p>
      <Link className="text-link" to="/dashboard">返回仪表盘</Link>
    </section>
  );
}
