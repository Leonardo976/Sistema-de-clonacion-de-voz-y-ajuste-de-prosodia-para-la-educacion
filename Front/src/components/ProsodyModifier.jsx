import React, { useState, useEffect, useRef } from 'react';
import { Toaster } from 'react-hot-toast';
import axios from 'axios';
import toast from 'react-hot-toast';

/**
 * Editor de prosodia.
 * ▸ Permite seleccionar palabras individuales o rangos (clic + ⇧-clic)
 * ▸ Aplicar speed / pitch / volume a selección o a todo el audio
 * ▸ Genera bloques compactos para el backend (rango start_time-end_time)
 */
function ProsodyModifier({ transcriptionData, generatedAudio, onDeleteAudio }) {
  /* ──────────────── estado ──────────────── */
  const [words, setWords]          = useState([]);                // lista de {word,start,end,effects}
  const [selection, setSelection]  = useState(new Set());         // índices seleccionados
  const [globalEffects, setGlobal] = useState({ speed: null, pitch: null, volume: null });
  const [isProsodyGenerating, setIsProsodyGenerating] = useState(false);
  const [modifiedAudio, setModifiedAudio] = useState(null);
  const deletingRef = useRef(false);

  /* util */
  const defaultValue = (type) => (type === 'speed' ? 1.0 : 0.0);
  const displayValue = (type, val) => (val === null ? defaultValue(type) : val);

  /* ───────── carga de marcas de tiempo ───────── */
  useEffect(() => {
    if (!transcriptionData || !transcriptionData.transcription) return;

    let wordArray = [];
    if (Array.isArray(transcriptionData.transcription)) {
      wordArray = transcriptionData.transcription;
    } else {
      /* parsea formato "(0.00) hola (0.35) mundo…" */
      const tokens = transcriptionData.transcription.split(' ');
      for (let i = 0; i < tokens.length; i++) {
        if (/^\(\d+(\.\d+)?\)$/.test(tokens[i])) {
          const start = parseFloat(tokens[i].slice(1, -1));
          const word  = tokens[i + 1] || '';
          let end     = start + 0.5;
          if (i + 2 < tokens.length && /^\(\d+(\.\d+)?\)$/.test(tokens[i + 2])) {
            end = parseFloat(tokens[i + 2].slice(1, -1));
          }
          wordArray.push({ word, start_time: start, end_time: end });
          i++; // saltar palabra
        }
      }
    }

    const wordsWithFx = wordArray.map(w => ({
      ...w,
      effects: { speed: null, pitch: null, volume: null }
    }));
    setWords(wordsWithFx);
    setSelection(new Set());
  }, [transcriptionData]);

  /* ──────────────── selección ──────────────── */
  const toggleSelect = (rowIdx, withShift = false) => {
    setSelection(prev => {
      const next = new Set(prev);
      if (withShift && prev.size) {
        const last = [...prev].slice(-1)[0];
        const [a, b] = [last, rowIdx].sort((x, y) => x - y);
        for (let i = a; i <= b; i++) next.add(i);
      } else {
        next.has(rowIdx) ? next.delete(rowIdx) : next.add(rowIdx);
      }
      return next;
    });
  };

  /* ───────────── modificar palabra individual ───────────── */
  const handleCheckboxChange = (rowIdx, effectType) => {
    const currentVal = words[rowIdx].effects[effectType];
    if (currentVal === null) {
      const suggested = displayValue(effectType, currentVal);
      const input = prompt(
        `Ingrese valor para ${effectType} en "${words[rowIdx].word}"`,
        suggested
      );
      if (input !== null) {
        const num = parseFloat(input);
        if (!isNaN(num)) updateWordEffect(rowIdx, effectType, num);
      }
    } else {
      updateWordEffect(rowIdx, effectType, null);
    }
  };

  const updateWordEffect = (rowIdx, type, value) => {
    setWords(prev => {
      const nw = [...prev];
      nw[rowIdx] = {
        ...nw[rowIdx],
        effects: { ...nw[rowIdx].effects, [type]: value }
      };
      return nw;
    });
  };

  /* ───────────── aplicar a selección múltiple ───────────── */
  const applyToSelection = (effectType) => {
    if (selection.size === 0) {
      toast.error('No hay palabras seleccionadas');
      return;
    }
    const suggested = displayValue(effectType, null);
    const input = prompt(
      `Ingrese valor para ${effectType} (${selection.size} palabras)`,
      suggested
    );
    if (input === null) return;
    const num = parseFloat(input);
    if (isNaN(num)) return;

    setWords(prev => {
      const nw = [...prev];
      selection.forEach(idx => {
        nw[idx] = {
          ...nw[idx],
          effects: { ...nw[idx].effects, [effectType]: num }
        };
      });
      return nw;
    });
  };

  /* ───────────── efectos globales ───────────── */
  const handleGlobalCheckboxChange = (effectType) => {
    const cur = globalEffects[effectType];
    if (cur === null) {
      const suggested = displayValue(effectType, cur);
      const input = prompt(`Ingrese valor para ${effectType} global`, suggested);
      if (input !== null) {
        const num = parseFloat(input);
        if (!isNaN(num))
          setGlobal(prev => ({ ...prev, [effectType]: num }));
    } } else {
      setGlobal(prev => ({ ...prev, [effectType]: null }));
    }
  };

  /* ───────────── construir payload ───────────── */
  const compileModifications = () => {
    const mods = [];

    /* global */
    if (globalEffects.speed !== null || globalEffects.pitch !== null || globalEffects.volume !== null) {
      mods.push({
        start_time: 0.0,
        end_time:   9999.0,
        speed_change:   globalEffects.speed   ?? 1.0,
        pitch_shift:    globalEffects.pitch   ?? 0.0,
        volume_change:  globalEffects.volume  ?? 0.0
      });
    }

    /* por palabras - compactar bloques contiguos con mismo efecto */
    let block = null;
    const pushBlock = () => { if (block) { delete block.__key; mods.push(block); block = null; } };

    words.forEach(({ start_time, end_time, effects }) => {
      const { speed, pitch, volume } = effects;
      if (speed === null && pitch === null && volume === null) {
        pushBlock();
        return;
      }
      const key = JSON.stringify(effects);
      if (
        block &&
        block.__key === key &&
        Math.abs(block.end_time - start_time) < 1e-4
      ) {
        block.end_time = end_time; // extender
      } else {
        pushBlock();
        block = {
          start_time,
          end_time,
          speed_change: speed ?? 1.0,
          pitch_shift:  pitch ?? 0.0,
          volume_change: volume ?? 0.0,
          __key: key
        };
      }
    });
    pushBlock();
    return mods;
  };

  /* ───────────── enviar al backend ───────────── */
  const handleGenerarProsodia = async () => {
    if (!generatedAudio) {
      toast.error('No hay audio para procesar');
      return;
    }
    const modifications = compileModifications();
    if (modifications.length === 0) {
      toast.error('No se seleccionaron cambios');
      return;
    }

    setIsProsodyGenerating(true);
    try {
      const res = await axios.post('http://localhost:5000/api/modify_prosody', {
        audio_path: generatedAudio,
        modifications
      });
      if (res.data.output_audio_path) {
        setModifiedAudio(res.data.output_audio_path);
        toast.success('Prosodia generada');
      } else {
        toast.error('Error al generar prosodia');
      }
    } catch (err) {
      toast.error('Error al generar prosodia');
      console.error(err);
    } finally {
      setIsProsodyGenerating(false);
    }
  };

  /* ───────── eliminar audio modificado ───────── */
  const handleDeleteModified = async () => {
    if (!modifiedAudio || deletingRef.current) return;
    if (!window.confirm('¿Eliminar el audio con prosodia?')) return;

    deletingRef.current = true;
    try {
      await onDeleteAudio?.(modifiedAudio);
      setModifiedAudio(null);
    } finally {
      deletingRef.current = false;
    }
  };

  /* ──────── Reiniciar ajustes y selección ──────── */
  const resetAll = () => {
    // quita speed / pitch / volume de cada palabra
    setWords(prev =>
      prev.map(w => ({
        ...w,
        effects: { speed: null, pitch: null, volume: null }
      }))
    );
    // limpia efectos globales
    setGlobal({ speed: null, pitch: null, volume: null });
    // desmarca palabras
    setSelection(new Set());
  };

  /* ──────────────────────────── render ──────────────────────────── */
  return (
    <div className="p-6 bg-white rounded-xl shadow-lg">
      <Toaster position="top-right" />

      {/* Encabezado */}
      <div className="mb-8">
        <h3 className="text-2xl font-bold text-gray-800 mb-2 flex items-center">
          {/* icono lápiz */}
          <svg xmlns="http://www.w3.org/2000/svg" className="mr-2 text-blue-600" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
          </svg>
          Editor de Prosodia
        </h3>
        <p className="text-gray-600">Ajusta velocidad, tono y volumen por palabra, rango o global.</p>
      </div>

      {/* Ajustes globales */}
      <div className="mb-8 bg-blue-50 p-4 rounded-lg">
        <h4 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="mr-2 text-blue-600" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
          </svg>
          Ajustes Globales
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {['speed', 'pitch', 'volume'].map((type) => (
            <button
              key={type}
              onClick={() => handleGlobalCheckboxChange(type)}
              className={`p-3 rounded-lg flex items-center justify-center transition-all ${
                globalEffects[type] !== null
                  ? 'bg-blue-100 border-2 border-blue-300'
                  : 'bg-white border-2 border-gray-200 hover:border-blue-200'
              }`}
            >
              {/* iconos */}
              {type === 'speed' && (
                <svg xmlns="http://www.w3.org/2000/svg" className="mr-2 text-blue-600" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"></circle>
                  <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
              )}
              {type === 'pitch' && (
                <svg xmlns="http://www.w3.org/2000/svg" className="mr-2 text-blue-600" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
                </svg>
              )}
              {type === 'volume' && (
                <svg xmlns="http://www.w3.org/2000/svg" className="mr-2 text-blue-600" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                </svg>
              )}
              <span className="capitalize">
                {type === 'speed' ? 'Velocidad' : type === 'pitch' ? 'Tono' : 'Volumen'}
                <span className={`ml-2 ${globalEffects[type] !== null ? 'text-blue-600' : 'text-gray-400'}`}>
                  ({displayValue(type, globalEffects[type])})
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Tabla por palabra */}
      <div className="mb-8">
        <h4 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="mr-2 text-blue-600" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 12l2 2l4-4"></path>
            <circle cx="12" cy="12" r="10"></circle>
          </svg>
          Ajustes por Palabra
        </h4>

        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Palabra</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Inicio (s)</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Fin (s)</th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">Velocidad</th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">Tono</th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">Volumen</th>
                <th className="px-2 text-center">
                  <button
                    onClick={resetAll}
                    className="px-2 py-1 bg-red-100 hover:bg-red-200 rounded text-red-700 text-xs"
                    title="Quitar todos los ajustes y desmarcar"
                  >
                    Reiniciar ajustes
                  </button>
                </th>
              </tr>
            </thead>

            <tbody className="bg-white divide-y divide-gray-200">
              {words.map((w, idx) => (
                <tr key={idx} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{w.word}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{w.start_time.toFixed(2)}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{w.end_time.toFixed(2)}</td>

                  {['speed', 'pitch', 'volume'].map((eff) => (
                    <td key={eff} className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleCheckboxChange(idx, eff)}
                        className={`p-2 rounded-full transition-all ${
                          w.effects[eff] !== null
                            ? 'bg-blue-100 text-blue-600 hover:bg-blue-200'
                            : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                        }`}
                      >
                        {displayValue(eff, w.effects[eff])}
                      </button>
                    </td>
                  ))}

                  {/* checkbox selección */}
                  <td className="px-2 text-center">
                    <input
                      type="checkbox"
                      checked={selection.has(idx)}
                      onChange={(e) => toggleSelect(idx, e.nativeEvent.shiftKey)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* barra de acciones */}
      <div className="flex flex-wrap gap-4 justify-center">
        {['speed', 'pitch', 'volume'].map((eff) => {
          const label = eff === 'speed' ? 'velocidad' : eff === 'pitch' ? 'tono' : 'volumen';
          return (
            <button
              key={eff}
              onClick={() => applyToSelection(eff)}
              className="px-4 py-2 bg-purple-100 hover:bg-purple-200 rounded-lg text-purple-700"
            >
              Ajustar {label} de selección
            </button>
          );
        })}

        <button
          onClick={handleGenerarProsodia}
          disabled={isProsodyGenerating}
          className={`px-6 py-3 rounded-xl font-medium flex items-center transition-all ${
            isProsodyGenerating ? 'bg-blue-300 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {isProsodyGenerating ? (
            <>
              <svg className="animate-spin h-5 w-5 mr-3" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Procesando…
            </>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" className="mr-2" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 12l2 2l4-4"></path>
                <circle cx="12" cy="12" r="10"></circle>
              </svg>
              Generar Audio Modificado
            </>
          )}
        </button>
      </div>

      {/* Audio resultante */}
      {modifiedAudio && (
        <div className="mt-8 bg-green-50 p-4 rounded-lg">
          <h4 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="mr-2 text-green-600" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
            </svg>
            Resultado Final
          </h4>

          <div className="bg-white p-4 rounded-lg shadow">
            <audio controls className="w-full">
              <source src={`http://localhost:5000/api/get_audio/${encodeURIComponent(modifiedAudio)}`} type="audio/wav" />
              Tu navegador no soporta el elemento de audio.
            </audio>
          </div>

          <button
            onClick={handleDeleteModified}
            className="mt-4 px-4 py-2 bg-red-100 hover:bg-red-200 text-red-600 rounded-lg transition-colors flex items-center"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="mr-2" width="24" height="24" fill="currentColor" viewBox="0 0 448 512">
              <path d="M135.2 17.7L144 0h160l8.8 17.7L416 32H32l103.2-14.3zM400 96v368c0 26.5-21.5 48-48 48H96c-26.5 
              0-48-21.5-48-48V96h352z" />
            </svg>
            Eliminar versión
          </button>
        </div>
      )}
    </div>
  );
}

export default ProsodyModifier;
