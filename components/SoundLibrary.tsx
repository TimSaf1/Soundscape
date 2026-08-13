// components/SoundLibrary.tsx

import { useMemo } from 'react';
import type { BeatPackType } from '../types'; // Импортируем тип для дерева звуков

type Props = {
  sounds: BeatPackType[];
};

export const SoundLibrary = ({ sounds }: Props) => {
  const tree = useMemo(() => generateSoundsTree(sounds), [sounds]);

  return (
    <div className="sound-library">
      {/* Отрисовываем корневую директорию */}
      {tree.map((pack) => renderDirectory(pack))}
    </div>
  );
};

const renderDirectory = (dir: BeatPackType) => {
  return (
    <details key={dir.name}>
      <summary>{dir.name}</summary>
      <ul>
        {/* Сначала показываем файлы */}
        {dir.files?.map((file) => (
          <li key={file}>
            <button onClick={() => playSound(file)}>
              {file.replace('.wav', '')}
            </button>
          </li>
        ))}
        {/* Затем рекурсивно отрисовываем подпапки */}
        {dir.children?.map(child => renderDirectory(child))}
      </ul>
    </details>
  );
};

const playSound = (url: string) => {
  new Audio(url).play();
};
