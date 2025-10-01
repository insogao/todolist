import React from 'react';

interface ProgressStep {
  id: string;
  label: string;
  status: 'pending' | 'active' | 'completed';
  icon?: string;
}

interface ProgressIndicatorProps {
  steps: ProgressStep[];
  currentMessage?: string;
}

export function ProgressIndicator({ steps, currentMessage }: ProgressIndicatorProps) {
  return (
    <div className="progress-indicator">
      <div className="progress-steps">
        {steps.map((step, index) => (
          <React.Fragment key={step.id}>
            <div className={`progress-step ${step.status}`}>
              <div className="step-icon">
                {step.status === 'completed' ? (
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M13.5 4L6 11.5L2.5 8"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : step.status === 'active' ? (
                  <div className="spinner" />
                ) : (
                  <div className="dot" />
                )}
              </div>
              <div className="step-content">
                <div className="step-label">{step.label}</div>
                {step.status === 'active' && currentMessage && (
                  <div className="step-message">{currentMessage}</div>
                )}
              </div>
            </div>
            {index < steps.length - 1 && (
              <div className={`progress-connector ${step.status === 'completed' ? 'completed' : ''}`} />
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
