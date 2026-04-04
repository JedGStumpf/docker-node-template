/**
 * EquipmentStatusBadge — displays equipment readiness status for an instructor assignment.
 */
import React from 'react';

export type EquipmentStatus = 'ready' | 'pending_checkout' | 'unknown';

interface EquipmentStatusBadgeProps {
  status: EquipmentStatus | string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  ready: { label: 'Ready', color: '#16a34a' },           // green
  pending_checkout: { label: 'Pending Checkout', color: '#d97706' }, // yellow/amber
  unknown: { label: 'Unknown', color: '#6b7280' },       // gray
};

export function EquipmentStatusBadge({ status }: EquipmentStatusBadgeProps) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.unknown;
  return (
    <span
      data-testid="equipment-status-badge"
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: '4px',
        backgroundColor: config.color,
        color: '#fff',
        fontSize: '0.8rem',
        fontWeight: 600,
      }}
    >
      {config.label}
    </span>
  );
}

export default EquipmentStatusBadge;
