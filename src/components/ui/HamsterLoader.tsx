'use client';

import React from 'react';
import styles from './HamsterLoader.module.css';

export interface HamsterLoaderProps {
  /**
   * Size of the loader. Can be a preset ('sm', 'md', 'lg', 'xl') or a numeric font size in pixels.
   * Default is 'md' (12px base font size -> ~144px wheel).
   */
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | number;
  /**
   * Optional loading caption shown beneath the wheel.
   */
  text?: React.ReactNode;
  /**
   * If true, centers the loader in full viewport height / full screen overlay.
   */
  fullScreen?: boolean;
  /**
   * Additional wrapper class name.
   */
  className?: string;
  /**
   * Additional wrapper inline styles.
   */
  style?: React.CSSProperties;
}

const SIZE_MAP: Record<string, string> = {
  xs: '5px',
  sm: '6.5px',
  md: '8.5px',
  lg: '11px',
  xl: '14px',
};


export default function HamsterLoader({
  size = 'md',
  text,
  fullScreen = false,
  className = '',
  style = {},
}: HamsterLoaderProps) {
  const fontSize = typeof size === 'number' ? `${size}px` : SIZE_MAP[size] || SIZE_MAP.md;

  const content = (
    <div
      className={`flex flex-col items-center justify-center gap-4 ${className}`}
      style={style}
    >
      <div
        aria-label="Orange and tan hamster running in a metal wheel"
        role="img"
        className={styles.wheelAndHamster}
        style={{ '--loader-font-size': fontSize } as React.CSSProperties}
      >
        <div className={styles.wheel} />
        <div className={styles.hamster}>
          <div className={styles.hamsterBody}>
            <div className={styles.hamsterHead}>
              <div className={styles.hamsterEar} />
              <div className={styles.hamsterEye} />
              <div className={styles.hamsterNose} />
            </div>
            <div className={`${styles.hamsterLimb} ${styles.hamsterLimbFr}`} />
            <div className={`${styles.hamsterLimb} ${styles.hamsterLimbFl}`} />
            <div className={`${styles.hamsterLimb} ${styles.hamsterLimbBr}`} />
            <div className={`${styles.hamsterLimb} ${styles.hamsterLimbBl}`} />
            <div className={styles.hamsterTail} />
          </div>
        </div>
        <div className={styles.spoke} />
      </div>

      {text && (
        <div className="text-sm font-medium text-ztext-light animate-pulse tracking-wide text-center">
          {text}
        </div>
      )}
    </div>
  );

  if (fullScreen) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-zbg/90 backdrop-blur-sm">
        {content}
      </div>
    );
  }

  return content;
}

export { HamsterLoader };
