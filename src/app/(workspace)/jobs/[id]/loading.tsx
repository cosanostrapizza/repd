export default function JobLoading() {
  return (
    <div
      className="content job-loading"
      aria-busy="true"
      aria-label="Loading job workspace"
    >
      <div className="loading-line wide" />
      <div className="loading-line medium" />
      <div className="loading-workspace">
        <div className="loading-panel" />
        <div className="loading-panel" />
      </div>
    </div>
  );
}
