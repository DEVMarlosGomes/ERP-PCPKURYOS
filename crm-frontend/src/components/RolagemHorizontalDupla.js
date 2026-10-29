import React, { useEffect, useRef, useState } from "react";

/* PD-01 (reunião 28/10/2026): tabela larga com barra horizontal grossa embaixo e uma cópia
 * dela no topo, as duas sincronizadas. A barra do topo só aparece quando há o que rolar. */
export default function RolagemHorizontalDupla({ children, className = "", testId }) {
  const topoRef = useRef(null);
  const corpoRef = useRef(null);
  const [largura, setLargura] = useState(0);
  const [visivel, setVisivel] = useState(0);

  useEffect(() => {
    const corpo = corpoRef.current;
    if (!corpo) return undefined;
    const medir = () => {
      setLargura(corpo.scrollWidth);
      setVisivel(corpo.clientWidth);
    };
    medir();
    if (typeof ResizeObserver === "undefined") return undefined;
    const obs = new ResizeObserver(medir);
    obs.observe(corpo);
    if (corpo.firstElementChild) obs.observe(corpo.firstElementChild);
    return () => obs.disconnect();
  }, []);

  // Uma barra puxa a outra; o eco (a rolagem programada dispara o evento de volta) para na igualdade.
  const espelhar = (origem, destino) => {
    if (!origem || !destino || destino.scrollLeft === origem.scrollLeft) return;
    destino.scrollLeft = origem.scrollLeft;
  };

  const temRolagem = largura > visivel + 1;
  return (
    <div className={className}>
      {temRolagem && (
        <div
          ref={topoRef}
          className="rolagem-horizontal-grossa overflow-x-auto overflow-y-hidden"
          onScroll={() => espelhar(topoRef.current, corpoRef.current)}
          aria-hidden="true"
          data-testid={testId ? `${testId}-topo` : undefined}
        >
          <div style={{ width: largura, height: 1 }} />
        </div>
      )}
      <div
        ref={corpoRef}
        className="rolagem-horizontal-grossa overflow-x-auto"
        onScroll={() => espelhar(corpoRef.current, topoRef.current)}
        data-testid={testId}
      >
        {children}
      </div>
    </div>
  );
}
