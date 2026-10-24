import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { ScanQrIcon } from '@/components/icons/ScanQrIcon';

// The glyph hides itself from screen readers, so it has to be asked for explicitly.
const HIDDEN = { includeHiddenElements: true };

describe('ScanQrIcon', () => {
  it('draws the filled variant by default', () => {
    render(<ScanQrIcon />);
    expect(screen.getByTestId('scan-qr-icon-filled', HIDDEN)).toBeTruthy();
  });
  it.each(['filled', 'white', 'ink'] as const)('draws the %s variant in a box of the size asked for', (variant) => {
    render(<ScanQrIcon variant={variant} size={32} />);
    const svg = screen.getByTestId(`scan-qr-icon-${variant}`, HIDDEN);
    expect(svg.props.bbWidth).toBe(32);
    expect(svg.props.bbHeight).toBe(32);
    expect(svg.props.vbWidth).toBe(96);
    expect(svg.props.vbHeight).toBe(96);
  });
  it('draws the glyph at 47 percent of the circle, so it scales with the circle it is given', () => {
    // The glyph spans 27..69 in a 96 viewBox, plus half a stroke each side.
    const span = (69 + 3.45 / 2) - (27 - 3.45 / 2);
    expect(span / 96).toBeGreaterThan(0.45);
    expect(span / 96).toBeLessThan(0.49);
    render(<ScanQrIcon variant="white" size={64} />);
    const svg = screen.getByTestId('scan-qr-icon-white', HIDDEN);
    expect(svg.props.bbWidth / svg.props.vbWidth * span).toBeCloseTo(64 * 0.47, 0);
  });
  it('is hidden from screen readers: the control around it carries the name', () => {
    render(<ScanQrIcon variant="white" />);
    expect(screen.getByTestId('scan-qr-icon-white', HIDDEN).props.accessibilityElementsHidden).toBe(true);
  });
});
