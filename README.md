Descripción

<img width="1916" height="950" alt="Captura de pantalla 2025-02-04 211055" src="https://github.com/user-attachments/assets/bb423c57-ca8e-47ab-9305-9bab859c84e9" />

Este proyecto permite generar audio a partir de texto con múltiples estilos de habla y aplicar modificadores de prosodia (pitch, volumen, velocidad) en un paso de post-procesamiento. Utiliza un backend en Flask con el modelo F5 Spanish TTS y un frontend en React para la interfaz de usuario.

Requisitos Previos

Python 3.10

Node.js y npm

Librerías Python: Flask, librosa, pydub, numpy, soundfile, transformers, etc.

Modelo F5 Spanish TTS (descargado o cacheado automáticamente)

Conexión a internet para descargar dependencias y modelos

Instalación y ejecución backend

Clonar repositorio y entrar a la carpeta backend:
git clone cd

Crear y activar entorno virtual:
python -m venv env source env/bin/activate # Linux/macOS env\Scripts\activate # Windows

Instalar dependencias:
pip install -r requirements.txt

Ejecutar servidor Flask:
python infer_gradio.py

El backend se iniciará en http://localhost:5000.

Instalación y Ejecución Frontend

Entrar a la carpeta frontend (donde está React):
cd

Instalar dependencias:
npm install

Ejecutar la aplicación React:
npm start

El frontend se iniciará normalmente en http://localhost:3000.

Uso

Desde el frontend, carga audios de referencia para cada tipo de habla.
<img width="1322" height="560" alt="Captura de pantalla 2025-02-04 020502" src="https://github.com/user-attachments/assets/7adba696-93af-4cb4-9967-4443938598e4" />

Escribe texto que incluya los tipos de habla entre llaves {Regular} y usa las marcas de texto para modificadores <pitch +2>, <volumen -5>, <velocidad 1.2>.

Presiona "Generar Habla Multi-Estilo" para generar el audio con las modificaciones aplicadas en post-procesamiento.

Escucha el audio generado desde el reproductor en la interfaz.
<img width="1913" height="949" alt="Captura de pantalla 2025-02-04 213123" src="https://github.com/user-attachments/assets/c2ad6f0f-9708-4d90-a95a-04baa52e723f" />
<img width="1359" height="951" alt="Captura de pantalla 2025-02-04 213206" src="https://github.com/user-attachments/assets/d30d0178-b237-4ff5-b956-a7a6ab5f26bb" />

Notas Técnicas

El backend usa librosa y pydub para modificar pitch, volumen y velocidad del audio generado.

Se recomienda usar audios de referencia cortos (<15 segundos) para evitar warnings y truncamiento.

El backend maneja la limpieza automática de archivos temporales cada hora.

Posibles Errores y Soluciones

Error relacionado con attention_mask en transformers: Asegúrate que el backend pasa el parámetro attention_mask correctamente en la llamada al modelo.

Modificadores no aplicados: Verifica que el frontend esté enviando correctamente la lista de modificadores junto con el texto limpio.
