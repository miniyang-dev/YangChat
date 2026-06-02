import { Component, type ReactNode, type ErrorInfo } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

// F-W: Error Boundary — 防止任何 render 錯誤導致整頁白屏
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
            <div className="bg-gray-800 rounded-2xl p-8 max-w-sm w-full text-center">
              <div className="text-4xl mb-4">⚠️</div>
              <h2 className="text-white text-lg font-semibold mb-2">發生錯誤</h2>
              <p className="text-gray-400 text-sm mb-6">
                畫面渲染失敗，請嘗試重新整理。
              </p>
              <button
                onClick={() => window.location.reload()}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white rounded-lg py-2 text-sm font-medium transition-colors"
              >
                重新整理頁面
              </button>
            </div>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
