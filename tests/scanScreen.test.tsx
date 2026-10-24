import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ScanOverlay } from '@/components/quickscan/ScanOverlay';
import { ScanSurface } from '@/components/quickscan/ScanSurface';
import { ScanHeader } from '@/components/quickscan/ScanHeader';
import { WalletColors } from '@/theme';

const METRICS = { frame: { x: 0, y: 0, width: 360, height: 805 }, insets: { top: 35, left: 0, right: 0, bottom: 0 } };

function layout(width = 360, height = 805) {
  fireEvent(screen.getByTestId('scan-surface'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width, height } } });
}

describe('ScanOverlay', () => {
  const window = { left: 54, top: 146, size: 251 };

  it('dims around the window and draws four orange brackets', () => {
    render(<ScanOverlay window={window} />);
    expect(screen.getByTestId('scan-overlay')).toBeTruthy();
    const brackets = screen.getByTestId('scan-brackets');
    expect(brackets.props.stroke).toBe(WalletColors.orange);
    expect(brackets.props.strokeWidth).toBe(3.5);
    // 16 dp inside the window on every side.
    expect(brackets.props.width).toBe(251 - 31);
    expect(screen.getByTestId('scan-window')).toBeTruthy();
  });
});

describe('ScanSurface', () => {
  function setup(extra: Partial<React.ComponentProps<typeof ScanSurface>> = {}) {
    const upload = jest.fn();
    const torch = jest.fn();
    const manual = jest.fn();
    render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <ScanSurface
          background={null}
          actions={[
            { key: 'upload', label: 'Upload QR', accessibilityLabel: 'Upload a photo of a QR code', glyph: null, onPress: upload },
            { key: 'torch', label: 'Torch', accessibilityLabel: 'Torch, off', glyph: null, onPress: torch },
          ]}
          onManualEntry={manual}
          {...extra}
        />
      </SafeAreaProvider>,
    );
    return { upload, torch, manual };
  }

  it('draws nothing but the backdrop until it knows its size', () => {
    setup();
    expect(screen.queryByTestId('scan-overlay')).toBeNull();
    layout();
    expect(screen.getByTestId('scan-overlay')).toBeTruthy();
  });

  it('shows the two round buttons with their labels, and the link', () => {
    const h = setup();
    layout();
    expect(screen.getByText('Upload QR')).toBeTruthy();
    expect(screen.getByText('Torch')).toBeTruthy();
    expect(screen.getByText('Or enter a UPI ID')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Upload a photo of a QR code'));
    fireEvent.press(screen.getByLabelText('Torch, off'));
    fireEvent.press(screen.getByTestId('scan-manual-entry'));
    expect(h.upload).toHaveBeenCalledTimes(1);
    expect(h.torch).toHaveBeenCalledTimes(1);
    expect(h.manual).toHaveBeenCalledTimes(1);
  });

  it('shows an error line, and content inside the window', () => {
    setup({ error: 'No QR found', windowContent: <></> });
    layout();
    expect(screen.getByTestId('scan-error').props.children).toBe('No QR found');
  });

  it('puts the window where the geometry says on a 360 x 805 screen', () => {
    setup();
    layout();
    const style = StyleSheet.flatten(screen.getByTestId('scan-window').props.style);
    expect(style).toMatchObject({ left: 54, top: 146, width: 251, height: 251 });
  });
});

describe('ScanHeader', () => {
  it('has a back and a help button, the title and the subtitle', () => {
    const onBack = jest.fn();
    const onHelp = jest.fn();
    render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <ScanHeader onBack={onBack} onHelp={onHelp} />
      </SafeAreaProvider>,
    );
    expect(screen.getByText('Scan any QR')).toBeTruthy();
    expect(screen.getByText('Works with any UPI QR')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Back'));
    fireEvent.press(screen.getByLabelText('Help with scanning'));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onHelp).toHaveBeenCalledTimes(1);
  });
});
