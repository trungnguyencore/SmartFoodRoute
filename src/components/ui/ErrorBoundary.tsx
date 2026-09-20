import { Component, type PropsWithChildren } from "react";
export class ErrorBoundary extends Component<
  PropsWithChildren,
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <main className="auth-card card">
          <h1>Không mở được trang</h1>
          <p>Hãy tải lại để khôi phục phiên làm việc.</p>
          <button onClick={() => window.location.reload()}>
            Tải lại ứng dụng
          </button>
        </main>
      );
    return this.props.children;
  }
}
