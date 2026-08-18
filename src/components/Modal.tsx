import React from 'react';

export default function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4 modal-wrapper">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm modal-backdrop" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col fade-in modal-content">
        <div className="px-6 py-4 border-b flex items-center justify-between bg-gray-50 modal-header">
          <h3 className="font-bold text-lg" style={{ color: '#000' }}>{title}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white border hover:bg-gray-100 flex items-center justify-center no-print">✕</button>
        </div>
        <div className="p-6 overflow-y-auto modal-body">
          {children}
        </div>
      </div>
    </div>
  );
}
