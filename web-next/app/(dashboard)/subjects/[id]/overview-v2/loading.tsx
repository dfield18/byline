/**
 * Route-level loading skeleton for the new overview. Mirrors the real layout —
 * header, 4-up KPI strip, and a 2×3 card grid — as shimmer placeholders so the
 * page reserves its shape while the SubjectOverview fetch resolves.
 */
export default function OverviewV2Loading() {
  return (
    <div className="ovs">
      <style>{OVS_CSS}</style>
      <div className="ovs-head">
        <span className="ovs-bar" style={{ width: 180, height: 22 }} />
        <span className="ovs-bar" style={{ width: 120, height: 12 }} />
      </div>
      <div className="ovs-kpis">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="ovs-kpi">
            <span className="ovs-bar" style={{ width: "60%", height: 11 }} />
            <span className="ovs-bar" style={{ width: "45%", height: 26, marginTop: 10 }} />
            <span className="ovs-bar" style={{ width: "35%", height: 12, marginTop: 8 }} />
          </div>
        ))}
      </div>
      <div className="ovs-grid">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="ovs-card">
            <span className="ovs-bar" style={{ width: "40%", height: 11 }} />
            <span className="ovs-bar" style={{ width: "100%", height: 88, marginTop: 16, borderRadius: 10 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

const OVS_CSS = `
.ovs { max-width: 1224px; margin: 0 auto; }
.ovs-head { display: flex; align-items: baseline; gap: 12px; margin-bottom: 20px; }
.ovs-kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 18px; margin-bottom: 24px; }
.ovs-kpi { display: flex; flex-direction: column; }
.ovs-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
.ovs-card {
  background: #fff; border: 1px solid #e8e7e0; border-radius: 16px; padding: 18px 20px;
  box-shadow: 0 1px 2px rgba(28,24,14,0.045), 0 12px 26px -16px rgba(28,24,14,0.18);
}
.ovs-bar {
  display: block; border-radius: 6px;
  background: linear-gradient(90deg, #efeae0 25%, #f6f3ec 37%, #efeae0 63%);
  background-size: 400% 100%; animation: ovsShimmer 1.4s ease infinite;
}
@keyframes ovsShimmer { 0% { background-position: 100% 0; } 100% { background-position: 0 0; } }
@media (max-width: 860px) { .ovs-kpis { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 640px) { .ovs-grid { grid-template-columns: 1fr; } }
`;
