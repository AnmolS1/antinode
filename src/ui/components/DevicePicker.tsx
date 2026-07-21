/**
 * Device picker for the `input` source kind: enumerated devices with loopback
 * devices visually flagged (BlackHole / VB-Cable / Monitor name heuristics), and the
 * last choice remembered (localStorage `antinode:source`). Real enumeration happens in
 * T02; here we render a passed-in list (dev fixtures) so the UX is complete.
 */
import { useState } from 'react';

import { isLoopbackDevice } from '../util';
import type { DeviceFixture } from '../dev/fixtures';

export function DevicePicker({
  devices,
  initialDeviceId,
  onConfirm,
  onCancel,
}: {
  devices: DeviceFixture[];
  initialDeviceId?: string;
  onConfirm: (deviceId: string) => void;
  onCancel: () => void;
}) {
  const first = devices[0]?.deviceId ?? '';
  const [selected, setSelected] = useState<string>(initialDeviceId ?? first);

  return (
    <div className="devicepicker" role="group" aria-label="Choose an input device">
      <h3 className="panel__title">Pick an input device</h3>
      <p className="panel__hint">
        Loopback devices give a bit-clean, headphone-friendly signal. A microphone works too.
      </p>
      <ul className="devicepicker__list" role="list">
        {devices.map((d) => {
          const loop = isLoopbackDevice(d.label);
          const id = `dev-${d.deviceId}`;
          return (
            <li key={d.deviceId} className="devicepicker__item">
              <label className="device" htmlFor={id}>
                <input
                  id={id}
                  type="radio"
                  name="input-device"
                  value={d.deviceId}
                  checked={selected === d.deviceId}
                  onChange={() => setSelected(d.deviceId)}
                />
                <span className="device__label">{d.label}</span>
                {loop && (
                  <span className="device__flag" title="System-audio loopback device">
                    loopback
                  </span>
                )}
              </label>
            </li>
          );
        })}
      </ul>
      <div className="panel__actions">
        <button type="button" className="btn btn--ghost" onClick={onCancel}>
          Back
        </button>
        <button
          type="button"
          className="btn btn--primary"
          disabled={!selected}
          onClick={() => selected && onConfirm(selected)}
        >
          Use this device
        </button>
      </div>
    </div>
  );
}
