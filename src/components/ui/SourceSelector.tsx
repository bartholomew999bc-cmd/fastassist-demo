/**
 * FAST-Assist Studio — Source Selector
 *
 * Inline panel for switching the active video input.
 * Demo, Upload, and Webcam are fully operational.
 * RTSP, MJPEG, and DICOM are shown as disabled "Coming Soon" entries —
 * the underlying source implementations already exist in src/ingest/sources/.
 */

import { useRef } from 'react';
import { motion } from 'framer-motion';
import {
  RiVideoLine,
  RiUploadLine,
  RiCameraLine,
  RiWifiLine,
  RiRadioLine,
  RiFileLine,
} from 'react-icons/ri';
import { useIngest } from '@/hooks/useIngest';
import type { SourceKind } from '@/ingest/IVideoSource';

interface SourceOption {
  kind:      SourceKind;
  label:     string;
  icon:      React.ReactNode;
  available: boolean;
}

const SOURCES: SourceOption[] = [
  { kind: 'demo',      label: 'Demo Video', icon: <RiVideoLine  size={13} />, available: true  },
  { kind: 'upload',    label: 'Upload',     icon: <RiUploadLine size={13} />, available: true  },
  { kind: 'webcam',    label: 'Webcam',     icon: <RiCameraLine size={13} />, available: true  },
  { kind: 'rtsp',      label: 'RTSP',       icon: <RiWifiLine   size={13} />, available: false },
  { kind: 'mjpeg',     label: 'MJPEG',      icon: <RiRadioLine  size={13} />, available: false },
  { kind: 'dicom',     label: 'DICOM Cine', icon: <RiFileLine   size={13} />, available: false },
];

export function SourceSelector() {
  const { activeKind, isConnecting, switchToSource } = useIngest();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSelect = (kind: SourceKind) => {
    if (kind === 'upload') {
      fileInputRef.current?.click();
      return;
    }
    if (kind === 'demo') {
      void switchToSource({ kind: 'demo' });
    } else if (kind === 'webcam') {
      void switchToSource({ kind: 'webcam' });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      void switchToSource({ kind: 'upload', file });
      // Reset so the same file can be re-selected
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-0.5">
      {SOURCES.map(src => {
        const isActive = activeKind === src.kind;
        const disabled = !src.available || isConnecting;

        return (
          <motion.button
            key={src.kind}
            whileTap={disabled ? {} : { scale: 0.97 }}
            disabled={disabled}
            onClick={() => !disabled && handleSelect(src.kind)}
            className={[
              'w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left transition-all',
              isActive
                ? 'bg-teal-500/15 border border-teal-500/25 text-teal-300'
                : src.available
                ? 'border border-transparent text-white/45 hover:bg-white/5 hover:text-white/75 cursor-pointer'
                : 'border border-transparent text-white/18 cursor-not-allowed',
            ].join(' ')}
          >
            <div className="flex items-center gap-2">
              <span className={
                isActive
                  ? 'text-teal-400'
                  : src.available ? 'text-white/30' : 'text-white/12'
              }>
                {src.icon}
              </span>
              <span className="text-xs font-medium">{src.label}</span>
              {isActive && (
                <span className="w-1.5 h-1.5 rounded-full bg-teal-400 flex-shrink-0 ml-0.5" />
              )}
            </div>
            {!src.available && (
              <span className="text-2xs text-white/18 uppercase tracking-wider">
                Soon
              </span>
            )}
          </motion.button>
        );
      })}

      {/* Hidden file picker for Upload source */}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}
