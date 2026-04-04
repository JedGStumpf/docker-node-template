import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EquipmentStatusBadge } from '../../client/src/components/EquipmentStatusBadge';

describe('EquipmentStatusBadge', () => {
  it('renders "Ready" for ready status', () => {
    render(<EquipmentStatusBadge status="ready" />);
    expect(screen.getByText('Ready')).toBeInTheDocument();
  });

  it('renders "Pending Checkout" for pending_checkout status', () => {
    render(<EquipmentStatusBadge status="pending_checkout" />);
    expect(screen.getByText('Pending Checkout')).toBeInTheDocument();
  });

  it('renders "Unknown" for unknown status', () => {
    render(<EquipmentStatusBadge status="unknown" />);
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });

  it('renders "Unknown" for unrecognized status', () => {
    render(<EquipmentStatusBadge status="some_future_status" />);
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });
});
