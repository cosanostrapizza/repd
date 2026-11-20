export default function WorkspaceLoading() {
  return (
    <div
      className="content workspace-loading"
      aria-busy="true"
      aria-label="Loading workspace"
    >
      <div className="loading-line medium" />
      <div className="loading-line wide" />
      <div className="loading-workspace">
        <div className="loading-panel" />
        <div className="loading-panel" />
      </div>
    </div>
  );
}
