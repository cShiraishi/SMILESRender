import React from 'react';

interface State { hasError: boolean; message: string }

class ToolErrorBoundary extends React.Component<{ toolName: string; children: React.ReactNode }, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ margin: '10px', padding: '15px', border: '1px solid #f5c6cb', borderRadius: '10px', backgroundColor: '#fff3f3' }}>
          <strong style={{ color: '#721c24' }}>{this.props.toolName} failed to load</strong>
          <p style={{ fontSize: '12px', color: '#856404', margin: '5px 0 0' }}>{this.state.message}</p>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ToolErrorBoundary;
