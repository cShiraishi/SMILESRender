import React from 'react';

interface Props {
  toolName: string;
  children: React.ReactNode;
  onError?: () => void;
}

interface State { hasError: boolean; message: string }

class ToolErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  componentDidCatch() {
    // Notify parent so the progress counter isn't permanently stuck
    this.props.onError?.();
  }

  render() {
    if (this.state.hasError) return null; // hidden anyway; no visible output needed
    return this.props.children;
  }
}

export default ToolErrorBoundary;
