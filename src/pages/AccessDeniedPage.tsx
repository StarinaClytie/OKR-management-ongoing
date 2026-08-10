import { Link } from 'react-router-dom';

export function AccessDeniedPage() {
  return (
    <section className="status-page" aria-labelledby="access-denied-title">
      <p className="status-page__eyebrow">权限提示</p>
      <h1 id="access-denied-title">访问受限</h1>
      <p>当前演示角色没有访问此页面的权限。</p>
      <Link className="text-link" to="/dashboard">返回仪表盘</Link>
    </section>
  );
}
