import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, SafeAreaView, ScrollView, View, Text, TextInput, Pressable, Image, Alert, StyleSheet } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import * as ImagePicker from 'expo-image-picker';
import { createNativeVault } from './src/next/native';
const {
  createWorkspace
} = require('./src/next/workspace');
const {
  sessionFor
} = require('./src/next/commands');
const {
  activeResults
} = require('./src/next/consultation');
const {
  overview,
  displayTotals: totals,
  page
} = require('./src/next/overview');
const {
  scrutinizeElige8
} = require('./src/elige8');
const {
  createDocumentReview
} = require('./src/next/document-review');
const {
  createReportShare
} = require('./src/next/report-share');
const {
  formatEuro,
  inputEuro
} = require('./src/next/money');
const catalogue = require('./assets/fixtures.snapshot.json');
const {
  createLegacyImport
} = require('./src/next/legacy-import');
const money = formatEuro;
function errorText(error) {
  return {
    LOCKED: 'Desbloquea la app antes de continuar.',
    MIGRATION_INVALID: 'El archivo no es un historial antiguo compatible (versiones 1 o 2), contiene datos incorrectos o supera los límites. No se ha importado nada.',
    MIGRATION_ROUND_REQUIRED: 'Hay archivos sin jornada y la copia no contiene jornadas disponibles. Debes corregir o completar la copia original antes de trasladarla.',
    MIGRATION_NOT_EMPTY: 'El traslado solo se permite en un historial nuevo. No se mezcla ni reemplaza el historial existente.',
    MIGRATION_MAPPING_REQUIRED: 'Selecciona expresamente la jornada de cada archivo pendiente.',
    MIGRATION_REVIEW_REQUIRED: 'Vuelve a revisar el historial antiguo y confirma el traslado.',
    MONEY_INVALID: 'Introduce euros sin separadores de miles y con hasta dos decimales. Deja vacío lo pendiente.',
    REPORT_TOO_LARGE: 'El informe completo supera los límites de esta versión. Utiliza el resumen.',
    REPORT_BUSY: 'Hay otro informe en preparación.',
    REPORT_SHARING_UNAVAILABLE: 'Este dispositivo no permite abrir la hoja de compartir.',
    CIPHER_UNAVAILABLE: 'Esta compilación no incorpora el cifrado requerido. Se mantiene el acceso bloqueado.',
    UNLOCK_FAILED: 'No se ha podido desbloquear. Comprueba que el iPhone tiene un código de bloqueo o recupera una copia si has perdido el acceso.',
    STALE_VIEW: 'La sesión cambió. Vuelve a realizar la operación.',
    REVISION_CONFLICT: 'El historial cambió. Recárgalo antes de continuar.',
    WORKSPACE_BUSY: 'Hay otra operación en curso.',
    ROUND_EXISTS: 'Esa jornada ya existe.',
    DUPLICATE_FILE: 'Esta combinación ya está guardada en la jornada.',
    REVIEW_REQUIRED: 'Revisa el documento y confirma su contenido antes de importar.',
    DOCUMENT_BUSY: 'Hay un documento en lectura o guardado.',
    DOCUMENT_LIMIT: 'El documento supera los límites de lectura de esta versión.',
    DOCUMENT_UNREADABLE: 'No se ha podido interpretar el documento. Usa un PDF con texto de Lotería 300 o X15, o una foto completa y nítida del resguardo. Los boletos con varios Elige 8 deben importarse por separado.',
    DOCUMENT_PARTIAL_UNKNOWN: 'Hay páginas que no se reconocen. No se ha importado una parte del PDF: separa los boletos legibles o utiliza fotos de los resguardos.',
    DOCUMENT_COUNT_CHANGED: 'La cantidad de columnas debe coincidir con la detectada. Corrige los signos sin quitar columnas, o vuelve a leer el documento.',
    DOCUMENT_BETS_INVALID: 'Cada columna necesita 14 signos (1, X, 2) y dos signos del Pleno (0, 1, 2, M). Corrige todos los ? y las columnas repetidas.',
    ELIGE_DECISION_REQUIRED: 'Indica expresamente si quieres incluir Elige 8.',
    ELIGE_INVALID: 'Elige 8 requiere ocho partidos distintos del 1 al 14, ocho signos y su importe.',
    CAMERA_PERMISSION: 'Activa el permiso de cámara o selecciona una foto guardada.',
    RECOVERY_CANCELLED: 'La recuperación se interrumpió. Vuelve a revisar la copia.',
    RECOVERY_IN_PROGRESS: 'Termina o cancela la recuperación antes de abrir el historial.'
  }[error?.code] || 'No se ha completado la operación. Revisa los datos y vuelve a intentarlo. El historial anterior no se borra.';
}
function Button({
  title,
  onPress,
  disabled = false,
  selected = false
}) {
  return <Pressable accessibilityRole="button" accessibilityState={{
    disabled,
    selected
  }} disabled={disabled} onPress={onPress} style={[styles.button, selected && styles.selected, disabled && styles.disabled]}><Text style={styles.buttonText}>{title}</Text></Pressable>;
}
function Field({
  label,
  value,
  onChangeText,
  secret = false,
  multiline = false,
  editable = true,
  keyboardType = 'default'
}) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} editable={editable} multiline={multiline} secureTextEntry={secret} autoCapitalize="none" autoCorrect={false} keyboardType={keyboardType} style={[styles.input, multiline && {
      height: 160,
      textAlignVertical: 'top'
    }]} /></View>;
}
function Notice({
  children
}) {
  return <Text style={styles.notice}>{children}</Text>;
}
async function pick(type = '*/*') {
  const result = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: true,
    multiple: false,
    type
  });
  return result.canceled ? null : result.assets[0];
}
function RecoveryPanel({
  runtime,
  appState
}) {
  const [password, setPassword] = useState(''),
    [review, setReview] = useState(null),
    [busy, setBusy] = useState(false);
  const epoch = useRef(0);
  useEffect(() => {
    if (appState === 'background') {
      epoch.current++;
      setPassword('');
      setReview(null);
    }
  }, [appState]);
  useEffect(() => () => {
    epoch.current++;
    runtime.lostKeyRecovery.cancel();
  }, [runtime]);
  async function prepare() {
    const stamp = epoch.current;
    setBusy(true);
    setReview(null);
    try {
      const asset = await pick();
      if (!asset || stamp !== epoch.current) return;
      const text = await runtime.readImportText(asset.uri, 'backup');
      if (stamp !== epoch.current) return;
      const value = await runtime.lostKeyRecovery.prepare(text, password);
      if (stamp !== epoch.current) return;
      setReview(value);
      setPassword('');
    } catch (error) {
      if (stamp === epoch.current) Alert.alert('Recuperar copia', errorText(error));
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    setBusy(true);
    try {
      await runtime.lostKeyRecovery.commit(review.token);
      setReview(null);
      Alert.alert('Copia recuperada', 'Desbloquea para consultar el historial recuperado. Se ha conservado el almacén anterior.');
    } catch (error) {
      setReview(null);
      Alert.alert('Recuperar copia', errorText(error));
    } finally {
      setBusy(false);
    }
  }
  return <View style={styles.card}><Text style={styles.heading}>Recuperar una copia cifrada</Text><Notice>Se verificará en otro almacén. El anterior se conserva. Se requiere el código o la biometría del iPhone y la contraseña de la copia.</Notice>
 {!review && <><Field label="Contraseña de la copia" value={password} onChangeText={setPassword} secret /><Button title="Elegir y revisar copia" onPress={prepare} disabled={busy} /></>}
 {review && <><Text style={styles.text}>{review.rounds} jornadas · {review.files} archivos · {review.columns} apuestas</Text><Button title="Confirmar recuperación" onPress={confirm} disabled={busy} /></>}
 <Button title="Cancelar recuperación" disabled={busy} onPress={() => {
      epoch.current++;
      runtime.lostKeyRecovery.cancel();
      setReview(null);
      setPassword('');
    }} />
 </View>;
}
function PrivateWorkspace({
  runtime
}) {
  const workspace = runtime.workspace,
    data = workspace.snapshot(),
    [season, setSeason] = useState(() => data?.state.lastView?.roundId.split(':')[0] || catalogue.current.season),
    [number, setNumber] = useState(''),
    [price, setPrice] = useState('0,75');
  const [working, setWorking] = useState(false),
    [search, setSearch] = useState(''),
    [offset, setOffset] = useState(0);
  useEffect(() => {
    if (!data) return;
    const id = data.state.lastView?.roundId,
      selected = data.state.rounds.find(x => x.id === id);
    if (selected) setSeason(selected.season);
    setPrice(((data.state.seasons[selected?.season] ?? data.state.price) / 100).toFixed(2).replace('.', ','));
  }, [data?.state.lastView?.roundId, !!data]);
  useEffect(() => {
    setOffset(0);
    setSearch('');
  }, [data?.state.lastView?.fileId, data?.state.lastView?.hits, data?.state.lastView?.columnNumber]);
  if (!data) return <View style={styles.card}><Text style={styles.text}>El historial aún no está cargado.</Text><Button title="Cargar historial" disabled={workspace.isBusy()} onPress={() => workspace.load().catch(e => Alert.alert('Historial', errorText(e)))} /></View>;
  const state = data.state,
    v = state.lastView,
    r = state.rounds.find(x => x.id === v?.roundId),
    f = state.files.find(x => x.id === v?.fileId),
    disabled = working || workspace.isBusy();
  async function perform(command) {
    setWorking(true);
    try {
      await workspace.apply(command);
    } catch (error) {
      Alert.alert('No se ha guardado', errorText(error));
    } finally {
      setWorking(false);
    }
  }
  async function importTxt() {
    if (!r) return;
    const roundId = r.id;
    setWorking(true);
    try {
      const ticket = workspace.ticket();
      const asset = await pick();
      if (!asset) return;
      workspace.assertTicket(ticket);
      const text = await runtime.readImportText(asset.uri, 'txt');
      workspace.assertTicket(ticket);
      const command = {
        type: 'importTxt',
        roundId,
        text,
        name: asset.name,
        id: 'file-' + Date.now()
      };
      try {
        await workspace.apply(command, ticket);
      } catch (error) {
        if (error.code !== 'DUPLICATE_FILE') throw error;
        Alert.alert('Combinación ya guardada', 'Coincide con otro archivo de esta jornada. ¿Quieres conservar otra copia independiente?', [{
          text: 'Cancelar',
          style: 'cancel'
        }, {
          text: 'Guardar otra copia',
          onPress: () => workspace.apply({
            ...command,
            allowDuplicate: true
          }, ticket).catch(e => Alert.alert('No se ha guardado', errorText(e)))
        }]);
      }
    } catch (error) {
      Alert.alert('Importar TXT', errorText(error));
    } finally {
      setWorking(false);
    }
  }
  function addRound() {
    const entry = catalogue.rounds.find(x => x.season === season && x.round === Number(number));
    perform({
      type: 'addRound',
      season,
      number: Number(number),
      matches: entry ? entry.matches.map((label, i) => ({
        number: i + 1,
        label,
        startsAt: null,
        sourceId: null
      })) : []
    });
  }
  function savePrice() {
    if (!/^\d{1,6}([,.]\d{1,2})?$/.test(price.trim())) return Alert.alert('Precio', 'Introduce euros con un máximo de dos decimales.');
    perform({
      type: 'seasonPrice',
      season,
      price: Math.round(Number(price.replace(',', '.')) * 100)
    });
  }
  return <>
 <View style={styles.card}><Text style={styles.heading}>Jornadas</Text><View style={styles.wrap}>{state.rounds.map(x => <Button key={x.id} title={x.season + ' · ' + x.number} selected={r?.id === x.id} disabled={disabled} onPress={() => perform({
          type: 'selectRound',
          roundId: x.id
        })} />)}</View>
 <Field label="Temporada (2026-27)" value={season} onChangeText={setSeason} /><Field label="Número de jornada" value={number} onChangeText={setNumber} keyboardType="number-pad" /><Button title="Añadir jornada" disabled={disabled} onPress={addRound} />
 <Text style={styles.text}>Precio guardado: {money(state.seasons[season] ?? state.price)} por apuesta</Text><Field label="Nuevo precio por apuesta (€)" value={price} onChangeText={setPrice} keyboardType="decimal-pad" /><Button title="Guardar precio de temporada" disabled={disabled} onPress={savePrice} /><Notice>Los archivos importados conservan el precio con el que se guardaron.</Notice></View>
 {r && <View style={styles.card}><Text style={styles.heading}>Jornada {r.number} · {r.season}</Text><Notice>{r.matches.length ? 'Partidos de la copia local de Lotería 300. No se han consultado nuevos marcadores.' : 'Esta jornada aún no tiene partidos guardados.'}</Notice><Button title="Importar TXT" disabled={disabled} onPress={importTxt} />{state.files.filter(x => x.roundId === r.id).map(x => <Button key={x.id} title={x.name + ' · ' + x.bets.length + ' apuestas'} selected={f?.id === x.id} disabled={disabled} onPress={() => perform({
        type: 'selectFile',
        fileId: x.id
      })} />)}</View>}
 {f && <Consultation key={f.id} state={state} file={f} view={v} disabled={disabled} perform={perform} search={search} setSearch={setSearch} offset={offset} setOffset={setOffset} />}
 {r && <PrizeEditor key={r.id} round={r} disabled={disabled} perform={perform} />}
 {f && <ReportPanel key={'report-' + f.id} runtime={runtime} file={f} disabled={disabled} />}
 <BackupPanel runtime={runtime} />
 {data.revision === 0 && !state.rounds.length && !state.files.length && <LegacyImportPanel runtime={runtime} disabled={disabled} />}
 {r && <DocumentImportPanel key={r.id} runtime={runtime} roundId={r.id} disabled={disabled} />}
 <Notice>Sin actualización automática. LiveScore y la recepción directa desde WhatsApp siguen pendientes. Los premios se introducen manualmente.</Notice>
 </>;
}
function PrizeEditor({
  round,
  disabled,
  perform
}) {
  const categories = [15, 14, 13, 12, 11, 10],
    saved = categories.map(n => round.prizes[n]).join('|') + '|' + round.elige8Prize;
  const [inputs, setInputs] = useState(() => Object.fromEntries(categories.map(n => [n, inputEuro(round.prizes[n])]))),
    [elige, setElige] = useState(inputEuro(round.elige8Prize));
  useEffect(() => {
    setInputs(Object.fromEntries(categories.map(n => [n, inputEuro(round.prizes[n])])));
    setElige(inputEuro(round.elige8Prize));
  }, [round.id, saved]);
  return <View style={styles.card}><Text style={styles.heading}>Premios unitarios · jornada {round.number}</Text><Notice>Importes manuales. Vacío significa pendiente; cero significa cero euros. En 15 introduce solo el premio de 15: el de 14 se sumará aparte.</Notice>
 {categories.map(n => <Field key={n} label={'Categoría ' + (n === 15 ? '15 (14 + Pleno)' : n) + ' (€)'} value={inputs[n]} editable={!disabled} keyboardType="decimal-pad" onChangeText={value => setInputs(current => ({
      ...current,
      [n]: value
    }))} />)}
 <Field label="Premio unitario de Elige 8 (€)" value={elige} editable={!disabled} keyboardType="decimal-pad" onChangeText={setElige} />
 <Button title="Guardar premios manuales de esta jornada" disabled={disabled} onPress={() => perform({
      type: 'setPrizes',
      roundId: round.id,
      inputs,
      elige8Input: elige
    })} />
 <Notice>{round.prizeInfo ? 'Último guardado manual: ' + round.prizeInfo.checkedAt : 'Sin verificación automática de premios.'} Los cambios escritos se aplican al pulsar Guardar.</Notice></View>;
}
function ReportPanel({
  runtime,
  file,
  disabled
}) {
  const [busy, setBusy] = useState(false),
    service = runtime.reports;
  async function exportReport(variant) {
    setBusy(true);
    try {
      await service.export(file.id, variant);
    } catch (error) {
      if (AppState.currentState === 'active') Alert.alert('Informe PDF', errorText(error));
    } finally {
      setBusy(false);
    }
  }
  return <View style={styles.card}><Text style={styles.heading}>Informe de {file.name}</Text><Notice>Utiliza la consulta guardada de este archivo, incluida su simulación si está activa. Se indicarán el origen manual de los premios y los resultados pendientes.</Notice><Button title="Guardar o compartir PDF resumido" disabled={disabled || busy} onPress={() => exportReport('summary')} /><Button title="Guardar o compartir PDF con partidos" disabled={disabled || busy} onPress={() => exportReport('full')} /><Notice>Ambos incluyen recuentos y balances, sin enumerar apuestas. El segundo añade partidos y el detalle de Elige 8. Consulta cada columna en la app cuando lo necesites.</Notice></View>;
}
function DocumentImportPanel({
  runtime,
  roundId,
  disabled
}) {
  const [service] = useState(() => createDocumentReview({
    access: runtime.access,
    workspace: runtime.workspace,
    reader: runtime.readDocument
  }));
  const [review, setReview] = useState(null),
    [text, setText] = useState(''),
    [mode, setMode] = useState('pending'),
    [numbers, setNumbers] = useState(''),
    [signs, setSigns] = useState(''),
    [cost, setCost] = useState(''),
    [checked, setChecked] = useState(false),
    [busy, setBusy] = useState(false);
  const epoch = useRef(0);
  useEffect(() => {
    service.connect();
    return () => {
      epoch.current++;
      service.dispose();
    };
  }, [service]);
  async function choose(kind, source) {
    const stamp = ++epoch.current;
    service.cancel();
    setReview(null);
    setChecked(false);
    setBusy(true);
    let uri = null;
    try {
      const ticket = runtime.workspace.ticket();
      let asset;
      if (kind === 'pdf') asset = await pick('application/pdf');else {
        if (source === 'camera') {
          const permission = await ImagePicker.requestCameraPermissionsAsync();
          if (stamp !== epoch.current) return;
          runtime.workspace.assertTicket(ticket);
          if (!permission.granted) throw Object.assign(Error(), {
            code: 'CAMERA_PERMISSION'
          });
        }
        const result = source === 'camera' ? await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          quality: 1,
          exif: false
        }) : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 1,
          exif: false
        });
        asset = result.canceled ? null : result.assets[0];
      }
      if (!asset) return;
      uri = asset.uri;
      if (stamp !== epoch.current) return;
      runtime.workspace.assertTicket(ticket);
      const value = await service.prepare({
        kind,
        uri,
        name: asset.name || asset.fileName || (kind === 'pdf' ? 'Documento.pdf' : 'Foto.jpg'),
        roundId
      });
      if (stamp !== epoch.current) return;
      setReview(value);
      setText(value.reviewText);
      setNumbers(value.eligeNumbers);
      setSigns(value.eligeSigns);
      setCost('');
      setMode('pending');
    } catch (error) {
      if (stamp === epoch.current && AppState.currentState === 'active') Alert.alert('Leer documento', errorText(error));
    } finally {
      if (uri) try {
        await runtime.discardDocument(uri);
      } catch {}
      setBusy(false);
    }
  }
  async function save(allowDuplicate = false) {
    if (!review) return;
    setBusy(true);
    try {
      await service.confirm(review.token, {
        id: 'document-' + Date.now(),
        text,
        reviewed: checked,
        elige: {
          mode,
          numbers,
          signs,
          cost
        },
        allowDuplicate
      });
      setReview(null);
      setText('');
      setSigns('');
      setNumbers('');
    } catch (error) {
      if (error.code === 'DUPLICATE_FILE' && !allowDuplicate) Alert.alert('Combinación ya guardada', '¿Guardar otra copia independiente en esta jornada?', [{
        text: 'Cancelar',
        style: 'cancel'
      }, {
        text: 'Guardar copia',
        onPress: () => save(true)
      }]);else Alert.alert('Revisar importación', errorText(error));
    } finally {
      setBusy(false);
    }
  }
  return <View style={styles.card}><Text style={styles.heading}>PDF y foto · revisión previa</Text><View style={styles.wrap}><Button title="Elegir PDF" disabled={disabled || busy} onPress={() => choose('pdf')} /><Button title="Elegir foto" disabled={disabled || busy} onPress={() => choose('photo', 'library')} /><Button title="Fotografiar resguardo" disabled={disabled || busy} onPress={() => choose('photo', 'camera')} /></View>
 {busy && <Notice>Leyendo o guardando el documento en este iPhone…</Notice>}
 {review && <><Text style={styles.text}>{review.name} · {review.count} columnas · jornada {roundId}</Text><Notice>{review.format === 'photo' ? 'Vista del resguardo. Revisa cada signo y el Pleno.' : 'PDF de ' + review.pageCount + ' páginas. La vista previa corresponde solo a la primera; revisa también las columnas de las demás.'}</Notice>
 {review.preview && <Image accessibilityLabel="Vista previa del documento" source={{
        uri: review.preview
      }} resizeMode="contain" style={{
        width: '100%',
        height: 260
      }} />}
 {review.warnings.map((warning, i) => <Notice key={i}>{warning}</Notice>)}
 <Field label="Columnas detectadas: corrige todos los ? y compara con el original" editable={!busy} value={text} onChangeText={value => {
        setText(value.toUpperCase());
        setChecked(false);
      }} multiline />
 <Text style={styles.heading}>Elige 8 independiente</Text><View style={styles.wrap}><Button title="Incluir Elige 8" selected={mode === 'include'} disabled={busy} onPress={() => {
          setMode('include');
          setChecked(false);
        }} /><Button title="Guardar sin Elige 8" selected={mode === 'exclude'} disabled={busy} onPress={() => {
          setMode('exclude');
          setChecked(false);
        }} /></View>
 {mode === 'include' && <><Notice>En PDF no se deducen los signos del Elige 8 de la primera columna. Comprueba sus ocho partidos, signos e importe en el original.</Notice><Field label="Ocho partidos, separados por comas" editable={!busy} value={numbers} onChangeText={v => {
          setNumbers(v);
          setChecked(false);
        }} /><Field label="Ocho signos de Elige 8" editable={!busy} value={signs} onChangeText={v => {
          setSigns(v.toUpperCase());
          setChecked(false);
        }} /><Field label="Importe de Elige 8 (€)" editable={!busy} value={cost} onChangeText={v => {
          setCost(v);
          setChecked(false);
        }} keyboardType="decimal-pad" /></>}
 <Button title={checked ? '✓ He revisado jornada, columnas, Pleno y Elige 8' : 'Confirmo la jornada y que he comparado las columnas, el Pleno y Elige 8 con el original'} selected={checked} disabled={busy} onPress={() => setChecked(!checked)} />
 <Button title="Guardar documento revisado" disabled={disabled || busy || !checked || mode === 'pending'} onPress={() => save()} /><Button title="Cancelar revisión" disabled={busy} onPress={() => {
        epoch.current++;
        service.cancel();
        setReview(null);
        setText('');
        setNumbers('');
        setSigns('');
        setCost('');
      }} />
 </>}
 </View>;
}
function LegacyImportPanel({
  runtime,
  disabled
}) {
  const service = useMemo(() => createLegacyImport({
    workspace: runtime.workspace,
    recovery: runtime.recovery,
    now: () => new Date().toISOString()
  }), [runtime]);
  const [draft, setDraft] = useState(null),
    [review, setReview] = useState(null),
    [mapping, setMapping] = useState({}),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false);
  const epoch = useRef(0);
  useEffect(() => {
    service.connect();
    return () => {
      epoch.current++;
      service.dispose();
    };
  }, [service]);
  function cancel() {
    epoch.current++;
    service.cancel();
    setDraft(null);
    setReview(null);
    setMapping({});
    setConfirmed(false);
  }
  async function choose() {
    const stamp = ++epoch.current;
    service.cancel();
    setDraft(null);
    setReview(null);
    setMapping({});
    setConfirmed(false);
    setBusy(true);
    try {
      const ticket = runtime.workspace.ticket(),
        asset = await pick();
      if (!asset || stamp !== epoch.current) return;
      runtime.workspace.assertTicket(ticket);
      const text = await runtime.readImportText(asset.uri, 'legacy');
      if (stamp !== epoch.current) return;
      runtime.workspace.assertTicket(ticket);
      setDraft(service.load(text));
    } catch (error) {
      if (stamp === epoch.current) Alert.alert('Trasladar historial', errorText(error));
    } finally {
      if (stamp === epoch.current) setBusy(false);
    }
  }
  async function prepare() {
    const stamp = epoch.current;
    setBusy(true);
    try {
      const value = await service.prepare(mapping);
      if (stamp === epoch.current) {
        setReview(value);
        setConfirmed(false);
      }
    } catch (error) {
      if (stamp === epoch.current) Alert.alert('Revisar traslado', errorText(error));
    } finally {
      if (stamp === epoch.current) setBusy(false);
    }
  }
  async function commit() {
    const stamp = epoch.current;
    setBusy(true);
    try {
      await service.commit({
        confirmed
      });
      if (stamp !== epoch.current) return;
      setDraft(null);
      setReview(null);
      setConfirmed(false);
      try {
        await runtime.workspace.load();
      } catch {
        Alert.alert('Historial trasladado', 'Los datos se han guardado. Vuelve a cargar el historial para consultarlos.');
      }
    } catch (error) {
      if (stamp === epoch.current) {
        setReview(null);
        setConfirmed(false);
        Alert.alert('Trasladar historial', errorText(error));
      }
    } finally {
      if (stamp === epoch.current) setBusy(false);
    }
  }
  return <View style={styles.card}><Text style={styles.heading}>Trasladar historial antiguo</Text><Notice>Elige un archivo JSON del historial anterior, no un TXT de apuestas. Se revisará antes de importar. El archivo original se conserva. Las consultas anteriores pasarán a simulaciones y los premios se recalcularán sumando 15 y 14.</Notice>
  <Button title="Elegir historial antiguo" disabled={disabled || busy} onPress={choose} />
  {draft && !review && <><Text style={styles.text}>{draft.rounds} jornadas · {draft.files} archivos · {draft.columns} apuestas</Text>{draft.unassigned.map(f => <View key={f.id}><Text style={styles.label}>Asigna una jornada a {f.name}</Text><View style={styles.wrap}>{draft.availableRounds.map(r => <Button key={r.id} title={r.label} selected={mapping[f.id] === r.id} disabled={disabled || busy} onPress={() => setMapping({
            ...mapping,
            [f.id]: r.id
          })} />)}</View></View>)}<Button title="Revisar antes de trasladar" disabled={disabled || busy || draft.unassigned.some(f => !Object.hasOwn(mapping, f.id))} onPress={prepare} /></>}
  {review && <><Text style={styles.text}>Se trasladarán {review.rounds} jornadas, {review.files} archivos y {review.columns} apuestas.</Text>{review.notes.map(note => <Notice key={note}>{note}</Notice>)}<Button title={confirmed ? '✓ He revisado el resumen' : 'Confirmar que he revisado el resumen'} selected={confirmed} disabled={disabled || busy} onPress={() => setConfirmed(!confirmed)} /><Button title="Trasladar al historial cifrado" disabled={disabled || busy || !confirmed} onPress={commit} /></>}
  {draft && <Button title="Cancelar traslado" disabled={busy} onPress={cancel} />}</View>;
}
function BackupPanel({
  runtime
}) {
  const [password, setPassword] = useState(''),
    [busy, setBusy] = useState(false);
  async function exportCopy() {
    let uri = null;
    setBusy(true);
    try {
      const ticket = runtime.workspace.ticket();
      const text = await runtime.recovery.exportBackup(password);
      runtime.workspace.assertTicket(ticket);
      uri = await runtime.createBackupCopy(text);
      runtime.workspace.assertTicket(ticket);
      if (!(await Sharing.isAvailableAsync())) throw Error('SHARING_UNAVAILABLE');
      await Sharing.shareAsync(uri, {
        mimeType: 'application/json',
        UTI: 'public.json',
        dialogTitle: 'Guardar copia cifrada'
      });
    } catch (error) {
      if (AppState.currentState === 'active') Alert.alert('Copia cifrada', errorText(error));
    } finally {
      if (uri) try {
        await runtime.removeBackupCopy(uri);
      } catch {}
      setBusy(false);
      setPassword('');
    }
  }
  async function verify() {
    setBusy(true);
    try {
      const ticket = runtime.workspace.ticket();
      const asset = await pick();
      if (!asset) return;
      runtime.workspace.assertTicket(ticket);
      const text = await runtime.readImportText(asset.uri, 'backup');
      runtime.workspace.assertTicket(ticket);
      await runtime.recovery.verifySavedBackup(text, password);
      runtime.workspace.assertTicket(ticket);
      await runtime.workspace.load();
      Alert.alert('Copia comprobada', 'El archivo se ha descifrado y coincide con el historial actual.');
    } catch (error) {
      if (AppState.currentState === 'active') Alert.alert('Comprobar copia', errorText(error));
    } finally {
      setBusy(false);
      setPassword('');
    }
  }
  return <View style={styles.card}><Text style={styles.heading}>Copias cifradas</Text><Notice>Guarda una copia y comprueba después el archivo guardado. La hoja de compartir por sí sola no confirma que se haya guardado.</Notice><Field label="Contraseña de copia (mínimo 12 caracteres)" value={password} onChangeText={setPassword} secret /><Button title="Crear y guardar copia cifrada" disabled={busy} onPress={exportCopy} /><Button title="Comprobar copia guardada" disabled={busy} onPress={verify} /></View>;
}
function Consultation({
  state,
  file,
  view,
  disabled,
  perform,
  search,
  setSearch,
  offset,
  setOffset
}) {
  const r = state.rounds.find(x => x.id === file.roundId),
    session = sessionFor(state, file),
    results = activeResults(session);
  const [signs, setSigns] = useState(results.signs),
    [pleno, setPleno] = useState(results.pleno),
    [screen, setScreen] = useState('partidos'),
    [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    setSigns(results.signs);
    setPleno(results.pleno);
  }, [results.signs, results.pleno, session.mode]);
  const summary = useMemo(() => overview(file.bets, results), [file.bets, results.signs, results.pleno, results.status]);
  const balance = totals(summary, r.prizes, file.price),
    count = view.columnNumber !== null ? 1 : view.hits === null ? file.bets.length : summary.knownHistogram[view.hits];
  const rows = page(file.bets, results, {
    hits: view.hits,
    number: view.columnNumber,
    offset: Math.min(offset, Math.max(0, Math.floor((count - 1) / 25) * 25))
  });
  const elige = file.elige8 ? scrutinizeElige8(file.elige8, results.signs, r.elige8Prize) : null;
  const setSign = (index, value) => setSigns(current => current.slice(0, index) + value + current.slice(index + 1));
  const select = value => {
    setScreen(value);
    setMenuOpen(false);
  };
  return <View style={styles.scrutiny}><View style={styles.scrutinyHeader}><View><Text style={styles.eyebrow}>COMBINACIÓN</Text><Text style={styles.scrutinyTitle}>{file.name}</Text><Text style={styles.scrutinyMeta}>Jornada {r.number} · {file.bets.length.toLocaleString('es-ES')} apuestas</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Abrir menú de escrutinio" onPress={() => setMenuOpen(!menuOpen)} style={styles.menuButton}><Text style={styles.menuButtonText}>Opciones ▾</Text></Pressable></View>
 {menuOpen && <View style={styles.menu}><Button title="Partidos y resultados" selected={screen === 'partidos'} disabled={disabled} onPress={() => select('partidos')} /><Button title="Aciertos y columnas" selected={screen === 'aciertos'} disabled={disabled} onPress={() => select('aciertos')} /><Button title="Elige 8" selected={screen === 'elige'} disabled={disabled} onPress={() => select('elige')} /></View>}
 <View style={styles.tabRow}><Pressable accessibilityRole="tab" accessibilityState={{selected:screen === 'partidos'}} onPress={() => select('partidos')} style={[styles.tab, screen === 'partidos' && styles.tabActive]}><Text style={[styles.tabText, screen === 'partidos' && styles.tabTextActive]}>Partidos</Text></Pressable><Pressable accessibilityRole="tab" accessibilityState={{selected:screen === 'aciertos'}} onPress={() => select('aciertos')} style={[styles.tab, screen === 'aciertos' && styles.tabActive]}><Text style={[styles.tabText, screen === 'aciertos' && styles.tabTextActive]}>Aciertos</Text></Pressable><Pressable accessibilityRole="tab" accessibilityState={{selected:screen === 'elige'}} onPress={() => select('elige')} style={[styles.tab, screen === 'elige' && styles.tabActive]}><Text style={[styles.tabText, screen === 'elige' && styles.tabTextActive]}>Elige 8</Text></Pressable></View>
 {screen === 'partidos' && <><Text style={styles.badge}>{session.mode === 'simulation' ? 'SIMULACIÓN' : 'RESULTADOS GUARDADOS DE LA JORNADA'}</Text><Notice>{session.mode === 'simulation' ? 'La simulación no modifica los resultados de la jornada.' : r.results ? 'Origen: ' + r.results.source + ' · ' + r.results.checkedAt : 'No hay resultados consultados. Los partidos están pendientes.'}</Notice>
 <Text style={styles.sectionHeading}>Los 14 partidos</Text><View style={styles.fixtureList}>{Array.from({length: 14}, (_, index) => <View key={index} style={styles.fixture}><Text style={styles.fixtureNumber}>{index + 1}</Text><Text style={styles.fixtureName}>{r.matches[index]?.label || 'Partido sin nombre guardado'}</Text><View style={styles.signRow}>{['1', 'X', '2'].map(value => <Pressable key={value} accessibilityRole="button" accessibilityLabel={'Partido ' + (index + 1) + ': ' + value} accessibilityState={{selected: signs[index] === value}} disabled={disabled} onPress={() => setSign(index, value)} style={[styles.signButton, signs[index] === value && styles.signSelected]}><Text style={[styles.signText, signs[index] === value && styles.signTextSelected]}>{value}</Text></Pressable>)}</View></View>)}</View>
 <View style={styles.plenoCard}><Text style={styles.sectionHeading}>15 · Pleno al 15</Text>{['Local', 'Visitante'].map((label, index) => <View key={label} style={styles.plenoRow}><Text style={styles.plenoLabel}>{label}</Text><View style={styles.signRow}>{['0', '1', '2', 'M'].map(value => <Pressable key={value} accessibilityRole="button" accessibilityLabel={label + ': ' + value} accessibilityState={{selected: pleno[index] === value}} disabled={disabled} onPress={() => setPleno(current => current.slice(0, index) + value + current.slice(index + 1))} style={[styles.goalButton, pleno[index] === value && styles.goalSelected]}><Text style={styles.signText}>{value}</Text></Pressable>)}</View></View>)}</View>
 {(signs !== results.signs || pleno !== results.pleno) && <Notice>Cambios pendientes. Pulsa Guardar simulación para recalcular los aciertos.</Notice>}
 <Button title="Guardar simulación" disabled={disabled} onPress={() => perform({
      type: 'simulate',
      fileId: file.id,
      results: {
        signs,
        pleno
      }
    })} />
 <Button title="Resultados de la jornada" disabled={disabled} onPress={() => perform({
      type: 'showRound',
      fileId: file.id
    })} />
 <Button title="Guardar como resultados manuales" disabled={disabled} onPress={() => perform({
      type: 'roundResults',
      roundId: r.id,
      results: {
        signs,
        pleno
      }
    })} /><Notice>Los resultados manuales se guardan como provisionales. Este botón no consulta Internet ni acredita premios oficiales.</Notice></>}
 {screen === 'aciertos' && <>
 <Text style={styles.heading}>{summary.complete ? 'Aciertos por columna' : 'Aciertos conocidos · partidos pendientes'}</Text>
 <View style={styles.wrap}>{Array.from({
        length: 15
      }, (_, hits) => <Button key={hits} title={hits + ' · ' + summary.knownHistogram[hits]} selected={view.hits === hits} disabled={disabled} onPress={() => {
        setOffset(0);
        perform({
          type: 'filter',
          fileId: file.id,
          hits
        });
      }} />)}</View>
 <Text style={styles.text}>14 + Pleno: {summary.prizeCounts?.[15] ?? 'Pendiente'} · Cuenta también en la categoría 14.</Text><Text style={styles.text}>Quiniela jugado: {money(balance.cost)} · Premios: {money(balance.winnings)}</Text><Notice>Del 0 al 9 no son categorías de premio. Con partidos pendientes se cuentan solo los aciertos conocidos.</Notice>
 {balance.calculationError && <Notice>No se puede calcular el balance con estos importes. Revisa los premios antes de generar un informe; no se mostrará un total redondeado.</Notice>}
 {elige && <Text style={styles.text}>Elige 8 independiente: {elige.hits} aciertos · {elige.pending} pendientes · jugado {money(elige.cost)} · premios {money(elige.winnings)}</Text>}
 <Field label="Buscar número original de columna" value={search} onChangeText={setSearch} keyboardType="number-pad" /><Button title="Ver columna" disabled={disabled} onPress={() => {
      setOffset(0);
      perform({
        type: 'column',
        fileId: file.id,
        number: Number(search)
      });
    }} />
 <Button title="Ver todas las columnas" disabled={disabled} onPress={() => {
      setOffset(0);
      perform({
        type: 'filter',
        fileId: file.id,
        hits: null
      });
    }} />
 <Text style={styles.heading}>{count} columnas seleccionadas</Text>
 {rows.map(row => <View key={row.number} style={styles.column}><Text style={styles.heading}>Columna {row.number} · {row.hits} aciertos{row.pending ? ' · ' + row.pending + ' pendientes' : ''}</Text><Text style={styles.bet}>{row.bet.slice(0, 14)} · {row.bet.slice(14)}</Text>{row.matches.map(m => <View key={m.number} style={styles.match}><Text style={styles.matchName}>{m.number}. {r.matches[m.number - 1]?.label || 'Partido sin nombre guardado'}</Text><Text style={m.status === 'miss' ? styles.miss : m.status === 'hit' ? styles.hit : styles.pending}>{m.played} → {m.actual} {m.status === 'miss' ? 'Fallo' : m.status === 'hit' ? 'Acierto' : 'Pendiente'}</Text></View>)}<Text style={styles.text}>Pleno: jugado {row.bet.slice(14)} · resultado {results.pleno}</Text></View>)}
 <View style={styles.wrap}><Button title="Anteriores" disabled={disabled || offset === 0} onPress={() => setOffset(Math.max(0, offset - 25))} /><Button title="Siguientes" disabled={disabled || offset + 25 >= count} onPress={() => setOffset(offset + 25)} /></View></>}
 {screen === 'elige' && <><Text style={styles.heading}>Elige 8 independiente</Text>{!elige ? <Notice>Esta combinación no incluye Elige 8.</Notice> : <><View style={styles.eligeSummary}><Text style={styles.eyebrow}>RESULTADO DE LA SELECCIÓN</Text><Text style={styles.eligeHits}>{elige.hits} de 8 aciertos</Text><Text style={styles.scrutinyMeta}>{elige.pending ? elige.pending + ' pendientes' : 'Resultados completos'} · Jugado {money(elige.cost)}</Text></View>{file.elige8.picks.map(pick => { const actual = results.signs[pick.number - 1], hit = actual !== '?' && actual === pick.sign; return <View key={pick.number} style={[styles.eligePick, actual !== '?' && !hit && styles.eligeMiss]}><Text style={styles.fixtureNumber}>{pick.number}</Text><Text style={styles.fixtureName}>{r.matches[pick.number - 1]?.label || 'Partido sin nombre guardado'}</Text><Text style={hit ? styles.hit : actual === '?' ? styles.pending : styles.miss}>{pick.sign} → {actual}</Text></View>; })}<Notice>Elige 8 se calcula por separado de la Quiniela.</Notice></>}</>}
 </View>;
}
export default function AppNext() {
  const [runtime] = useState(() => {
    try {
      const value = createNativeVault();
      const workspace = createWorkspace({
        access: value.access,
        now: () => new Date().toISOString()
      });
      const reports = createReportShare({
        workspace,
        render: value.renderReport,
        remove: value.removeReport,
        now: () => new Date().toISOString(),
        logo: () => require('./assets/report-logo.json').data,
        available: () => Sharing.isAvailableAsync(),
        share: uri => Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          UTI: 'com.adobe.pdf',
          dialogTitle: 'Guardar o compartir escrutinio'
        })
      });
      return {
        ...value,
        workspace,
        reports
      };
    } catch {
      return null;
    }
  });
  const [, redraw] = useState(0),
    [appState, setAppState] = useState(AppState.currentState),
    [busy, setBusy] = useState(false),
    [restore, setRestore] = useState(false);
  useEffect(() => {
    if (!runtime) return;
    runtime.workspace.connect();
    const refresh = () => redraw(n => n + 1),
      off = runtime.access.subscribe(refresh),
      offWorkspace = runtime.workspace.subscribe(refresh);
    const sub = AppState.addEventListener('change', value => {
      runtime.onAppState(value);
      setAppState(value);
    });
    return () => {
      sub.remove();
      off();
      offWorkspace();
      runtime.lostKeyRecovery.cancel();
      runtime.workspace.dispose();
      runtime.access.lock().catch(() => {});
    };
  }, [runtime]);
  async function unlock() {
    setBusy(true);
    try {
      await runtime.access.unlock();
      await runtime.workspace.load();
    } catch (error) {
      if (AppState.currentState === 'active') Alert.alert('Acceso', errorText(error));
    } finally {
      setBusy(false);
    }
  }
  const unlocked = runtime?.access.getStatus().status === 'unlocked';
  return <SafeAreaView style={styles.root}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"><View style={styles.header}><Image source={require('./assets/logo.png')} style={styles.logo} /><View style={styles.titleBox}><Text style={styles.title}>La Espartana</Text><Text style={styles.subtitle}>ESCRUTINIOS · PREPARACIÓN NATIVA</Text></View></View>
 {!runtime ? <Notice>Esta versión requiere una compilación propia para iPhone con los módulos de seguridad. No funciona en Expo Go ni como página web.</Notice> : <>
 {unlocked && appState === 'active' ? <><Button title="Bloquear" onPress={() => runtime.access.lock().catch(() => {})} /><PrivateWorkspace runtime={runtime} /></> : !unlocked && <><View style={styles.card}><Text style={styles.heading}>Tu historial está bloqueado</Text><Notice>Desbloquea con la biometría o el código del iPhone. No se realiza ninguna consulta a Internet.</Notice><Button title={busy ? 'Desbloqueando…' : 'Desbloquear'} disabled={busy} onPress={unlock} /><Button title={restore ? 'Cerrar recuperación' : 'Recuperar copia cifrada'} disabled={busy} onPress={() => {
              runtime.lostKeyRecovery.cancel();
              setRestore(!restore);
            }} /></View>{restore && <RecoveryPanel runtime={runtime} appState={appState} />}</>}
 </>}
 </ScrollView>{appState !== 'active' && <View style={styles.cover}><Text style={styles.title}>La Espartana</Text><Text style={styles.text}>Vista protegida</Text></View>}</SafeAreaView>;
}
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#071a39'
  },
  content: {
    padding: 16,
    paddingBottom: 40
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20
  },
  logo: {
    width: 64,
    height: 64,
    borderRadius: 32
  },
  titleBox: {
    flex: 1,
    marginLeft: 12
  },
  title: {
    fontSize: 25,
    color: '#efc66d',
    fontWeight: '800'
  },
  subtitle: {
    fontSize: 11,
    color: '#d3ddee',
    marginTop: 4
  },
  card: {
    backgroundColor: '#11294d',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16
  },
  heading: {
    color: '#f1cd80',
    fontSize: 18,
    fontWeight: '700',
    marginVertical: 8
  },
  scrutiny: {
    backgroundColor: '#11294d',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16
  },
  scrutinyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10
  },
  eyebrow: {
    color: '#bfcde0',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1
  },
  scrutinyTitle: {
    color: '#f8e5b3',
    fontSize: 21,
    fontWeight: '800',
    marginTop: 2
  },
  scrutinyMeta: {
    color: '#becce0',
    fontSize: 12,
    marginTop: 4
  },
  menuButton: {
    backgroundColor: '#17355e',
    borderColor: '#b99752',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10
  },
  menuButtonText: {
    color: '#f8e5b3',
    fontSize: 12,
    fontWeight: '700'
  },
  menu: {
    backgroundColor: '#081c39',
    borderColor: '#536d93',
    borderWidth: 1,
    borderRadius: 12,
    marginTop: 12,
    padding: 6
  },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: '#081c39',
    borderRadius: 12,
    padding: 4,
    marginTop: 16,
    marginBottom: 14
  },
  tab: {
    flex: 1,
    minHeight: 42,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 9
  },
  tabActive: {
    backgroundColor: '#f2f5fb'
  },
  tabText: {
    color: '#becce0',
    fontSize: 12,
    fontWeight: '700'
  },
  tabTextActive: {
    color: '#102843'
  },
  sectionHeading: {
    color: '#f1cd80',
    fontSize: 16,
    fontWeight: '800',
    marginVertical: 9
  },
  fixtureList: {
    borderColor: '#405a7b',
    borderWidth: 1,
    borderRadius: 13,
    overflow: 'hidden',
    backgroundColor: '#0c2344'
  },
  fixture: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    paddingHorizontal: 9,
    gap: 8,
    borderBottomColor: '#28466d',
    borderBottomWidth: 1
  },
  fixtureNumber: {
    color: '#bfcde0',
    fontSize: 12,
    width: 17,
    fontWeight: '800'
  },
  fixtureName: {
    flex: 1,
    color: '#f2f5fb',
    fontSize: 12,
    fontWeight: '600'
  },
  signRow: {
    flexDirection: 'row',
    gap: 4
  },
  signButton: {
    width: 35,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: '#536d93',
    borderWidth: 1,
    borderRadius: 7,
    backgroundColor: '#17355e'
  },
  signSelected: {
    backgroundColor: '#f1cd80',
    borderColor: '#ffe09a'
  },
  signText: {
    color: '#f2f5fb',
    fontWeight: '800',
    fontSize: 13
  },
  signTextSelected: {
    color: '#102843'
  },
  plenoCard: {
    marginTop: 16,
    backgroundColor: '#0c2344',
    borderColor: '#b99752',
    borderWidth: 1,
    borderRadius: 13,
    padding: 12
  },
  plenoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 7,
    gap: 8
  },
  plenoLabel: {
    color: '#d7e2f0',
    fontSize: 13,
    fontWeight: '600'
  },
  goalButton: {
    width: 31,
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: '#536d93',
    borderWidth: 1,
    borderRadius: 7,
    backgroundColor: '#17355e'
  },
  goalSelected: {
    backgroundColor: '#b99752',
    borderColor: '#ffe09a'
  },
  eligeSummary: {
    backgroundColor: '#081c39',
    borderRadius: 13,
    padding: 16,
    marginVertical: 10
  },
  eligeHits: {
    color: '#f1cd80',
    fontSize: 25,
    fontWeight: '800',
    marginTop: 3
  },
  eligePick: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#0c2344',
    borderBottomWidth: 1,
    borderBottomColor: '#28466d',
    minHeight: 51,
    paddingHorizontal: 9
  },
  eligeMiss: {
    backgroundColor: '#402638'
  },
  text: {
    color: '#f2f5fb',
    fontSize: 15,
    marginVertical: 6
  },
  notice: {
    color: '#becce0',
    fontSize: 13,
    lineHeight: 20,
    marginVertical: 8
  },
  button: {
    borderWidth: 1,
    borderColor: '#b99752',
    borderRadius: 10,
    padding: 11,
    margin: 3,
    backgroundColor: '#17355e'
  },
  buttonText: {
    color: '#f8e5b3',
    fontWeight: '600',
    textAlign: 'center'
  },
  selected: {
    backgroundColor: '#405a7b',
    borderColor: '#ffe09a'
  },
  disabled: {
    opacity: 0.45
  },
  field: {
    marginVertical: 7
  },
  label: {
    color: '#d7e2f0',
    marginBottom: 6
  },
  input: {
    borderColor: '#536d93',
    borderWidth: 1,
    borderRadius: 9,
    padding: 11,
    color: '#fff',
    backgroundColor: '#081c39',
    fontSize: 16
  },
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap'
  },
  badge: {
    color: '#ffdf97',
    fontSize: 12,
    fontWeight: '800',
    marginVertical: 8
  },
  column: {
    borderTopWidth: 1,
    borderColor: '#52617b',
    marginTop: 18,
    paddingTop: 10
  },
  bet: {
    color: '#fff',
    fontSize: 17,
    letterSpacing: 2,
    marginBottom: 9
  },
  match: {
    borderBottomWidth: 0.5,
    borderColor: '#344c70',
    paddingVertical: 7
  },
  matchName: {
    color: '#e4eaf5',
    fontSize: 14
  },
  hit: {
    color: '#80e4b4',
    marginTop: 4
  },
  miss: {
    color: '#ffacaa',
    marginTop: 4
  },
  pending: {
    color: '#dfcf9a',
    marginTop: 4
  },
  cover: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#071a39',
    alignItems: 'center',
    justifyContent: 'center'
  }
});
