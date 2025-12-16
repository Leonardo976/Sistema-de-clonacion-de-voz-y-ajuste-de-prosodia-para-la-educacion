import os
import tempfile
import logging
from pydub import AudioSegment, effects
import subprocess

# Configurar logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def pitch_shift_ffmpeg(segment, semitones):
    """
    Cambia el pitch de un segmento de audio usando ffmpeg sin alterar la duración.
    Retorna un nuevo AudioSegment.
    """
    factor = 2 ** (semitones / 12.0)
    new_rate = int(segment.frame_rate * factor)

    with tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as temp_in, \
         tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as temp_out:
        temp_in.close()
        temp_out.close()
        # Exporta el segmento original a WAV
        segment.export(temp_in.name, format="wav")
        # Comando ffmpeg para cambio de pitch manteniendo duración
        command = [
            "ffmpeg", "-y", "-i", temp_in.name,
            "-af", f"asetrate={new_rate},atempo={1/factor},aresample={segment.frame_rate}",
            temp_out.name
        ]
        subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        # Lee el resultado
        shifted = AudioSegment.from_file(temp_out.name, format="wav")
        # Limpia archivos temporales
        os.unlink(temp_in.name)
        os.unlink(temp_out.name)
        return shifted

def change_speed_ffmpeg(segment, speed=1.0):
    """
    Cambia la velocidad (tempo) de un segmento de audio usando ffmpeg (afecta duración, NO el pitch).
    """
    if speed == 1.0:
        return segment
    with tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as temp_in, \
         tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as temp_out:
        temp_in.close()
        temp_out.close()
        segment.export(temp_in.name, format="wav")
        command = [
            "ffmpeg", "-y", "-i", temp_in.name,
            "-filter:a", f"atempo={speed}",
            temp_out.name
        ]
        subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        changed = AudioSegment.from_file(temp_out.name, format="wav")
        os.unlink(temp_in.name)
        os.unlink(temp_out.name)
        return changed

def modify_prosody(
    audio_path,
    modifications,
    remove_silence=False,
    min_silence_len=500,
    silence_thresh=-40,
    keep_silence=250,
    cross_fade_duration=0.15,
    global_speed_change=1.0,
    output_path=None
):
    """
    Modifica la prosodia de un archivo de audio.
    - Cambia pitch, volumen y velocidad de segmentos usando PyDub+ffmpeg.
    """
    # Verificar que el archivo existe
    if not os.path.exists(audio_path):
        logger.error(f"El archivo de audio no existe: {audio_path}")
        raise FileNotFoundError(f"El archivo de audio no existe: {audio_path}")

    # Cargar el archivo de audio con pydub
    try:
        audio = AudioSegment.from_file(audio_path)
        logger.info(f"Cargado audio desde {audio_path} con duración {len(audio) / 1000:.2f}s")
    except Exception as e:
        logger.error(f"Error al cargar el audio: {e}")
        raise RuntimeError(f"Error al cargar el audio: {e}")

    # Aplicar eliminación de silencios si es necesario
    if remove_silence:
        logger.info("Eliminando silencios del audio")
        audio = effects.strip_silence(
            audio,
            silence_len=min_silence_len,
            silence_thresh=silence_thresh,
            padding=keep_silence
        )
        logger.info("Silencios eliminados")

    # Ordenar las modificaciones por start_time
    modifications = sorted(modifications, key=lambda x: x['start_time'])
    logger.info(f"Modificaciones ordenadas: {modifications}")

    # Inicializar variables para segmentación
    segments = []
    last_end_ms = 0

    for idx, mod in enumerate(modifications):
        start_time = mod.get('start_time', 0)
        end_time = mod.get('end_time', len(audio) / 1000)  # en segundos
        pitch_shift = mod.get('pitch_shift', 0)
        volume_change = mod.get('volume_change', 0)
        speed_change = mod.get('speed_change', 1.0)

        # Validaciones de tiempo y velocidad
        if start_time < 0 or end_time < 0:
            logger.error(f"Modificación {idx + 1}: Los tiempos de inicio y fin no pueden ser negativos.")
            raise ValueError(f"Modificación {idx + 1}: Los tiempos de inicio y fin no pueden ser negativos.")
        if start_time >= end_time:
            logger.error(f"Modificación {idx + 1}: El tiempo de inicio debe ser menor que el tiempo de fin.")
            raise ValueError(f"Modificación {idx + 1}: El tiempo de inicio debe ser menor que el tiempo de fin.")
        if speed_change <= 0:
            logger.error(f"Modificación {idx + 1}: El factor de cambio de velocidad debe ser mayor que 0.")
            raise ValueError(f"Modificación {idx + 1}: El factor de cambio de velocidad debe ser mayor que 0.")

        # Convertir tiempos a milisegundos
        start_ms = int(start_time * 1000)
        end_ms = int(end_time * 1000)

        # Asegurar que los índices estén dentro de los límites
        start_ms = max(0, min(start_ms, len(audio)))
        end_ms = max(0, min(end_ms, len(audio)))

        logger.info(f"Procesando modificación {idx + 1}: inicio={start_time}s ({start_ms}ms), fin={end_time}s ({end_ms}ms), "
                    f"pitch_shift={pitch_shift}, volume_change={volume_change}, speed_change={speed_change}")

        # Agregar segmento sin modificar antes de la modificación actual
        if start_ms > last_end_ms:
            unmodified_segment = audio[last_end_ms:start_ms]
            segments.append(unmodified_segment)
            logger.debug(f"Agregado segmento sin modificar: {last_end_ms}ms - {start_ms}ms")

        # Extraer el segmento a modificar
        segment = audio[start_ms:end_ms]
        logger.debug(f"Segmento a modificar: {len(segment) / 1000:.2f}s")

        # Cambiar pitch si es necesario
        if pitch_shift != 0:
            try:
                segment = pitch_shift_ffmpeg(segment, pitch_shift)
                logger.debug(f"Cambio de pitch aplicado: {pitch_shift} semitonos")
            except Exception as e:
                logger.error(f"Error al aplicar cambio de pitch en modificación {idx + 1}: {e}")

        # Cambiar velocidad si es necesario
        if speed_change != 1.0:
            try:
                segment = change_speed_ffmpeg(segment, speed_change)
                logger.debug(f"Cambio de velocidad aplicado: factor {speed_change}")
            except Exception as e:
                logger.error(f"Error al aplicar cambio de velocidad en modificación {idx + 1}: {e}")

        # Cambiar volumen si es necesario
        if volume_change != 0:
            segment = segment + volume_change
            logger.debug(f"Cambio de volumen aplicado: {volume_change} dB")

        # Evitar clipping (si necesario)
        if segment.max > 32767:
            segment = segment.apply_gain(-20)
            logger.debug("Segmento modificado normalizado para evitar clipping")

        segments.append(segment)
        logger.debug(f"Segmento modificado agregado: {start_ms}ms - {end_ms}ms")
        last_end_ms = end_ms

    # Agregar cualquier segmento restante sin modificar después de la última modificación
    if last_end_ms < len(audio):
        unmodified_segment = audio[last_end_ms:]
        segments.append(unmodified_segment)
        logger.debug(f"Agregado segmento sin modificar al final: {last_end_ms}ms - {len(audio)}ms")

    # Concatenar todos los segmentos con cross-fade si es necesario
    if cross_fade_duration > 0 and len(segments) > 1:
        cross_fade_ms = int(cross_fade_duration * 1000)
        final_audio = segments[0]
        for seg in segments[1:]:
            final_audio = final_audio.append(seg, crossfade=cross_fade_ms)
            logger.debug(f"Aplicado cross-fade de {cross_fade_ms}ms entre segmentos")
    else:
        final_audio = sum(segments)

    # Aplicar cambio de velocidad global si es necesario
    if global_speed_change != 1.0:
        logger.info(f"Aplicando cambio de velocidad global: {global_speed_change}x")
        final_audio = change_speed_ffmpeg(final_audio, global_speed_change)
        logger.debug(f"Cambio de velocidad global aplicado: {global_speed_change}x")

        if final_audio.max > 32767:
            final_audio = final_audio.apply_gain(-20)
            logger.debug("Audio final normalizado para evitar clipping global")

    # Guardar el audio modificado
    if output_path is None:
        try:
            with tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as tmp_file:
                output_path = tmp_file.name
                logger.debug(f"Ruta de salida no proporcionada, usando archivo temporal: {output_path}")
        except Exception as e:
            logger.error(f"Error al crear archivo temporal: {e}")
            raise RuntimeError(f"Error al crear archivo temporal: {e}")

    try:
        final_audio.export(output_path, format='wav')
        logger.info(f"Audio modificado guardado exitosamente en: {output_path}")
    except Exception as e:
        logger.error(f"Error al guardar el audio modificado: {e}")
        raise RuntimeError(f"Error al guardar el audio modificado: {e}")

    return output_path
