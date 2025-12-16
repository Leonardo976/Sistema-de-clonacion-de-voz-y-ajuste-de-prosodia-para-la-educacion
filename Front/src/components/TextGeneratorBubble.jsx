import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';

const TextGeneratorBubble = ({ onTextGenerated }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [topic, setTopic] = useState('');
  const [context, setContext] = useState('');
  const [preview, setPreview] = useState('');
  const previewRef = useRef(null);

  useEffect(() => {
    if (preview && previewRef.current) {
      previewRef.current.scrollTop = previewRef.current.scrollHeight;
    }
  }, [preview]);

  const handleGenerate = async () => {
    if (!topic.trim()) {
      toast.error('Escribe un tema');
      return;
    }
    setLoading(true);
    setPreview('');
    try {
      const res = await axios.post('http://localhost:5000/api/generate_text', { topic, context });
      if (res.data.text) {
        setPreview(res.data.text);
        toast.success('¡Generado!');
      } else {
        toast.error('Sin respuesta');
      }
    } catch (error) {
      console.error(error);
      toast.error('Error IA');
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = () => {
    if (onTextGenerated && preview) {
      onTextGenerated(preview);
      setIsOpen(false);
      setPreview('');
      setTopic('');
      setContext('');
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end font-sans">
      {isOpen && (
        <div 
          className="mb-4 bg-white rounded-xl shadow-2xl border-2 border-indigo-100 p-5 flex flex-col animate-in slide-in-from-bottom-5"
          style={{ 
            minWidth: '320px', minHeight: '400px',
            maxWidth: '600px', maxHeight: '80vh',
            resize: 'both', overflow: 'auto'
          }}
        >
          <div className="flex justify-between items-center mb-4 shrink-0">
            <h3 className="font-bold text-gray-700 text-lg">✨ Asistente IA</h3>
            <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-gray-600 font-bold">✕</button>
          </div>

          <div className="space-y-4 flex-grow flex flex-col">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Tema</label>
              <textarea
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="w-full p-3 text-sm border-2 border-gray-200 rounded-lg focus:border-indigo-500 outline-none min-h-[80px]"
                placeholder="Ej: Noticia sobre el clima..."
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Tono</label>
              <input
                value={context}
                onChange={(e) => setContext(e.target.value)}
                className="w-full p-3 text-sm border-2 border-gray-200 rounded-lg focus:border-indigo-500 outline-none"
                placeholder="Ej: Serio, Alegre..."
              />
            </div>

            {!preview ? (
              <button
                onClick={handleGenerate}
                disabled={loading}
                className={`w-full py-3 rounded-lg text-white font-bold shadow-md shrink-0 ${
                  loading ? 'bg-gray-400 cursor-wait' : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700'
                }`}
              >
                {loading ? 'Generando...' : '✨ Generar Guion'}
              </button>
            ) : (
              <div className="flex flex-col flex-grow min-h-0 animate-in fade-in">
                <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Resultado</label>
                <div ref={previewRef} className="bg-indigo-50 rounded-lg p-3 border border-indigo-100 overflow-y-auto flex-grow mb-3 text-sm text-gray-800">
                  {preview}
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => setPreview('')} className="flex-1 py-2 border border-gray-300 rounded-md text-xs font-bold hover:bg-gray-50">REINTENTAR</button>
                  <button onClick={handleAccept} className="flex-1 py-2 bg-green-500 text-white rounded-md text-xs font-bold hover:bg-green-600 shadow-sm">✔ USAR</button>
                </div>
              </div>
            )}
          </div>
          
          <div className="absolute bottom-1 right-1 pointer-events-none text-gray-400">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><path d="M10 10L10 0L0 10Z"/></svg>
          </div>
        </div>
      )}

      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-14 h-14 rounded-full shadow-2xl border-4 border-white text-2xl text-white flex items-center justify-center transition-transform ${
          isOpen ? 'bg-gray-600 rotate-45' : 'bg-gradient-to-r from-indigo-500 to-purple-600 hover:scale-110'
        }`}
      >
        {isOpen ? '+' : '✨'}
      </button>
    </div>
  );
};

export default TextGeneratorBubble;
