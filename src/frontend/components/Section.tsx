import React from 'react';
import { colors, font, radius, shadow } from '../styles/themes';

function Section(props: { title: string; children: React.JSX.Element }) {
  return (
    <section style={{
      backgroundColor: colors.surface,
      border: `1px solid ${colors.border}`,
      borderRadius: radius.lg,
      boxShadow: shadow.sm,
      marginBottom: '24px',
      width: '100%',
      fontFamily: font,
    }}>
      <div style={{
        padding: '16px 24px',
        borderBottom: `1px solid ${colors.borderLight}`,
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
      }}>
        <h2 style={{ fontSize: '14px', fontWeight: 600, color: colors.text, margin: 0 }}>
          {props.title}
        </h2>
      </div>
      <div style={{ padding: '24px' }}>{props.children}</div>
    </section>
  );
}

export default Section;
