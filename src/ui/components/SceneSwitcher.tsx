/**
 * Scene switcher — names come from `engine.scenes()`. Each scene is also reachable by
 * its number key (1–9); the buttons mirror that so everything is keyboard-operable
 * without memorizing shortcuts.
 */
export function SceneSwitcher({
  scenes,
  activeId,
  onSelect,
}: {
  scenes: { id: string; name: string }[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="scenes" role="group" aria-label="Scene">
      {scenes.map((s, i) => {
        const active = s.id === activeId;
        return (
          <button
            key={s.id}
            type="button"
            className={`scene-btn${active ? ' is-active' : ''}`}
            aria-pressed={active}
            onClick={() => onSelect(s.id)}
          >
            <span className="scene-btn__key mono" aria-hidden="true">
              {i + 1}
            </span>
            <span className="scene-btn__name">{s.name}</span>
          </button>
        );
      })}
    </div>
  );
}
