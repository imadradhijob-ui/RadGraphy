const net = require('net');

/**
 * DICOM Upper Layer Protocol (DULP) & DIMSE implementation for Node.js / Electron
 * Standard compliant with DICOM Part 8 (Network Communication Protocol)
 */

// PDUs
const PDU_A_ASSOCIATE_RQ = 0x01;
const PDU_A_ASSOCIATE_AC = 0x02;
const PDU_A_ASSOCIATE_RJ = 0x03;
const PDU_P_DATA_TF       = 0x04;
const PDU_A_RELEASE_RQ   = 0x05;
const PDU_A_RELEASE_RP   = 0x06;
const PDU_A_ABORT        = 0x07;

// SOP Classes
const SOP_VERIFICATION = '1.2.840.10008.1.1';
const SOP_STUDY_ROOT_FIND = '1.2.840.10008.5.1.4.1.2.2.1';
const SOP_PATIENT_ROOT_FIND = '1.2.840.10008.5.1.4.1.2.1.1';
const SOP_STUDY_ROOT_MOVE = '1.2.840.10008.5.1.4.1.2.2.2';
const SOP_STUDY_ROOT_GET = '1.2.840.10008.5.1.4.1.2.2.3';
const SOP_PATIENT_ROOT_MOVE = '1.2.840.10008.5.1.4.1.2.1.2';
const SOP_PATIENT_ROOT_GET = '1.2.840.10008.5.1.4.1.2.1.3';

const TS_IMPLICIT_VR_LE = '1.2.840.10008.1.2';
const TS_EXPLICIT_VR_LE = '1.2.840.10008.1.2.1';

const STORAGE_SOP_CLASSES = [
  '1.2.840.10008.5.1.4.1.1.2',      // CT Image Storage
  '1.2.840.10008.5.1.4.1.1.2.1',    // Enhanced CT Image Storage
  '1.2.840.10008.5.1.4.1.1.2.2',    // Legacy Converted Enhanced CT Image Storage
  '1.2.840.10008.5.1.4.1.1.4',      // MR Image Storage
  '1.2.840.10008.5.1.4.1.1.4.1',    // Enhanced MR Image Storage
  '1.2.840.10008.5.1.4.1.1.1.1',    // Digital X-Ray (Presentation)
  '1.2.840.10008.5.1.4.1.1.1.1.1',  // Digital X-Ray (Processing)
  '1.2.840.10008.5.1.4.1.1.1',      // CR Image Storage
  '1.2.840.10008.5.1.4.1.1.1.2',    // Digital Mammography (Presentation)
  '1.2.840.10008.5.1.4.1.1.3.1',    // Ultrasound Multiframe
  '1.2.840.10008.5.1.4.1.1.6.1',    // Ultrasound Image Storage
  '1.2.840.10008.5.1.4.1.1.7',      // Secondary Capture
  '1.2.840.10008.5.1.4.1.1.20',     // Nuclear Medicine
  '1.2.840.10008.5.1.4.1.1.128',    // PET Image Storage
  '1.2.840.10008.5.1.4.1.1.12.1',   // XA Image Storage
  '1.2.840.10008.5.1.4.1.1.12.2',   // XRF Image Storage
  '1.2.840.10008.5.1.4.1.1.481.1',  // RT Image Storage
  '1.2.840.10008.5.1.4.1.1.481.2',  // RT Dose Storage
  '1.2.840.10008.5.1.4.1.1.481.3',  // RT Structure Set
  '1.2.840.10008.5.1.4.1.1.104.1',  // Encapsulated PDF
];

function padString(str, len) {
  str = str || '';
  return str.padEnd(len, ' ').slice(0, len);
}

/**
 * Builds A-ASSOCIATE-RQ PDU Buffer
 */
function buildAssociateRq(callingAe, calledAe, presentationContexts) {
  const items = [];

  // Application Context Item (10H)
  const appContextUid = '1.2.840.10008.3.1.1.1';
  const appCtxBuf = Buffer.alloc(4 + appContextUid.length);
  appCtxBuf[0] = 0x10;
  appCtxBuf[1] = 0x00;
  appCtxBuf.writeUInt16BE(appContextUid.length, 2);
  appCtxBuf.write(appContextUid, 4, 'ascii');
  items.push(appCtxBuf);

  // Presentation Context Items (20H)
  presentationContexts.forEach((pc, idx) => {
    const pcId = pc.id !== undefined ? pc.id : (idx * 2) + 1; // Odd numbers (1, 3, 5...)
    
    // Abstract Syntax Item (30H)
    const asUid = pc.abstractSyntax;
    const asBuf = Buffer.alloc(4 + asUid.length);
    asBuf[0] = 0x30;
    asBuf[1] = 0x00;
    asBuf.writeUInt16BE(asUid.length, 2);
    asBuf.write(asUid, 4, 'ascii');

    // Transfer Syntax Items (40H)
    const tsBuffers = (pc.transferSyntaxes || [TS_IMPLICIT_VR_LE, TS_EXPLICIT_VR_LE]).map(tsUid => {
      const tsBuf = Buffer.alloc(4 + tsUid.length);
      tsBuf[0] = 0x40;
      tsBuf[1] = 0x00;
      tsBuf.writeUInt16BE(tsUid.length, 2);
      tsBuf.write(tsUid, 4, 'ascii');
      return tsBuf;
    });

    const pcContentLen = asBuf.length + tsBuffers.reduce((a, b) => a + b.length, 0);
    const pcHeader = Buffer.alloc(8);
    pcHeader[0] = 0x20;
    pcHeader[1] = 0x00;
    pcHeader.writeUInt16BE(4 + pcContentLen, 2);
    pcHeader[4] = pcId;
    pcHeader[5] = 0x00;
    pcHeader[6] = 0x00;
    pcHeader[7] = 0x00;

    items.push(Buffer.concat([pcHeader, asBuf, ...tsBuffers]));
  });

  // User Information Item (50H) - 16MB Maximum PDU for high-throughput PACS transfer
  const maxLenBuf = Buffer.alloc(8);
  maxLenBuf[0] = 0x51;
  maxLenBuf[1] = 0x00;
  maxLenBuf.writeUInt16BE(4, 2);
  maxLenBuf.writeUInt32BE(16777216, 4); // 16MB Max PDU Length

  const implUid = '1.2.826.0.1.3680043.9.7134.1.0';
  const implBuf = Buffer.alloc(4 + implUid.length);
  implBuf[0] = 0x52;
  implBuf[1] = 0x00;
  implBuf.writeUInt16BE(implUid.length, 2);
  implBuf.write(implUid, 4, 'ascii');

  const userInfoContentLen = maxLenBuf.length + implBuf.length;
  const userInfoHeader = Buffer.alloc(4);
  userInfoHeader[0] = 0x50;
  userInfoHeader[1] = 0x00;
  userInfoHeader.writeUInt16BE(userInfoContentLen, 2);

  items.push(Buffer.concat([userInfoHeader, maxLenBuf, implBuf]));

  const itemsTotalLen = items.reduce((a, b) => a + b.length, 0);
  const pduLen = 2 + 2 + 16 + 16 + 32 + itemsTotalLen;

  const header = Buffer.alloc(6 + 68);
  header[0] = PDU_A_ASSOCIATE_RQ;
  header[1] = 0x00;
  header.writeUInt32BE(pduLen, 2);
  header.writeUInt16BE(0x0001, 6);
  header.writeUInt16BE(0x0000, 8);

  header.write(padString(calledAe, 16), 10, 'ascii');
  header.write(padString(callingAe, 16), 26, 'ascii');
  header.fill(0, 42, 74);

  return Buffer.concat([header, ...items]);
}

/**
 * Builds A-ASSOCIATE-AC PDU Buffer (for C-STORE SCP)
 */
function buildAssociateAc(calledAe, callingAe, presentationContexts) {
  const items = [];

  const appContextUid = '1.2.840.10008.3.1.1.1';
  const appCtxBuf = Buffer.alloc(4 + appContextUid.length);
  appCtxBuf[0] = 0x10;
  appCtxBuf[1] = 0x00;
  appCtxBuf.writeUInt16BE(appContextUid.length, 2);
  appCtxBuf.write(appContextUid, 4, 'ascii');
  items.push(appCtxBuf);

  presentationContexts.forEach((pc) => {
    const pcId = pc.id;
    const tsUid = pc.transferSyntax || TS_EXPLICIT_VR_LE;
    const tsBuf = Buffer.alloc(4 + tsUid.length);
    tsBuf[0] = 0x40;
    tsBuf[1] = 0x00;
    tsBuf.writeUInt16BE(tsUid.length, 2);
    tsBuf.write(tsUid, 4, 'ascii');

    const pcHeader = Buffer.alloc(8);
    pcHeader[0] = 0x21; // Presentation Context AC
    pcHeader[1] = 0x00;
    pcHeader.writeUInt16BE(4 + tsBuf.length, 2);
    pcHeader[4] = pcId;
    pcHeader[5] = 0x00;
    pcHeader[6] = 0x00; // 0x00 = Acceptance
    pcHeader[7] = 0x00;
    items.push(Buffer.concat([pcHeader, tsBuf]));
  });

  const maxLenBuf = Buffer.alloc(8);
  maxLenBuf[0] = 0x51;
  maxLenBuf[1] = 0x00;
  maxLenBuf.writeUInt16BE(4, 2);
  maxLenBuf.writeUInt32BE(16777216, 4); // 16MB Max PDU Length

  const implUid = '1.2.826.0.1.3680043.9.7134.1.0';
  const implBuf = Buffer.alloc(4 + implUid.length);
  implBuf[0] = 0x52;
  implBuf[1] = 0x00;
  implBuf.writeUInt16BE(implUid.length, 2);
  implBuf.write(implUid, 4, 'ascii');

  const userInfoHeader = Buffer.alloc(4);
  userInfoHeader[0] = 0x50;
  userInfoHeader[1] = 0x00;
  userInfoHeader.writeUInt16BE(maxLenBuf.length + implBuf.length, 2);

  items.push(Buffer.concat([userInfoHeader, maxLenBuf, implBuf]));

  const itemsTotalLen = items.reduce((a, b) => a + b.length, 0);
  const pduLen = 2 + 2 + 16 + 16 + 32 + itemsTotalLen;

  const header = Buffer.alloc(6 + 68);
  header[0] = PDU_A_ASSOCIATE_AC;
  header[1] = 0x00;
  header.writeUInt32BE(pduLen, 2);
  header.writeUInt16BE(0x0001, 6);
  header.writeUInt16BE(0x0000, 8);
  header.write(padString(calledAe, 16), 10, 'ascii');
  header.write(padString(callingAe, 16), 26, 'ascii');
  header.fill(0, 42, 74);

  return Buffer.concat([header, ...items]);
}

/**
 * Builds C-ECHO-RQ Command Dataset
 */
function buildCEchoRq(pcId, messageId = 1) {
  const sopUid = SOP_VERIFICATION;
  const cmdBuf = Buffer.alloc(66 + (sopUid.length % 2 === 1 ? sopUid.length + 1 : sopUid.length));
  let offset = 0;

  cmdBuf.writeUInt16LE(0x0000, offset); offset += 2;
  cmdBuf.writeUInt16LE(0x0002, offset); offset += 2;
  const paddedSopUid = sopUid.length % 2 === 1 ? sopUid + '\0' : sopUid;
  cmdBuf.writeUInt32LE(paddedSopUid.length, offset); offset += 4;
  cmdBuf.write(paddedSopUid, offset, 'ascii'); offset += paddedSopUid.length;

  cmdBuf.writeUInt16LE(0x0000, offset); offset += 2;
  cmdBuf.writeUInt16LE(0x0100, offset); offset += 2;
  cmdBuf.writeUInt32LE(2, offset); offset += 4;
  cmdBuf.writeUInt16LE(0x0030, offset); offset += 2;

  cmdBuf.writeUInt16LE(0x0000, offset); offset += 2;
  cmdBuf.writeUInt16LE(0x0110, offset); offset += 2;
  cmdBuf.writeUInt32LE(2, offset); offset += 4;
  cmdBuf.writeUInt16LE(messageId, offset); offset += 2;

  cmdBuf.writeUInt16LE(0x0000, offset); offset += 2;
  cmdBuf.writeUInt16LE(0x0800, offset); offset += 2;
  cmdBuf.writeUInt32LE(2, offset); offset += 4;
  cmdBuf.writeUInt16LE(0x0101, offset); offset += 2;

  const actualCmdLen = offset;
  const fullCmdBuf = Buffer.alloc(actualCmdLen + 12);
  
  fullCmdBuf.writeUInt16LE(0x0000, 0);
  fullCmdBuf.writeUInt16LE(0x0000, 2);
  fullCmdBuf.writeUInt32LE(4, 4);
  fullCmdBuf.writeUInt32LE(actualCmdLen, 8);
  cmdBuf.copy(fullCmdBuf, 12, 0, actualCmdLen);

  const pDataBuf = Buffer.alloc(6 + 4 + 2 + fullCmdBuf.length);
  pDataBuf[0] = PDU_P_DATA_TF;
  pDataBuf[1] = 0x00;
  pDataBuf.writeUInt32BE(4 + 2 + fullCmdBuf.length, 2);
  pDataBuf.writeUInt32BE(2 + fullCmdBuf.length, 6);
  pDataBuf[10] = pcId;
  pDataBuf[11] = 0x03;
  fullCmdBuf.copy(pDataBuf, 12);

  return pDataBuf;
}

/**
 * Builds C-STORE-RSP Command Dataset
 */
function buildCStoreRsp(pcId, messageId = 1, status = 0x0000, affectedSopUid = '', affectedSopInstUid = '') {
  const cmdBufs = [];

  if (affectedSopUid) {
    let sopBuf = Buffer.from(affectedSopUid, 'ascii');
    if (sopBuf.length % 2 !== 0) sopBuf = Buffer.concat([sopBuf, Buffer.from([0x00])]);
    const sopElem = Buffer.alloc(8 + sopBuf.length);
    sopElem.writeUInt16LE(0x0000, 0);
    sopElem.writeUInt16LE(0x0002, 2);
    sopElem.writeUInt32LE(sopBuf.length, 4);
    sopBuf.copy(sopElem, 8);
    cmdBufs.push(sopElem);
  }

  // (0000,0100) Command Field: US 0x8001 (C-STORE-RSP)
  const cmdField = Buffer.alloc(10);
  cmdField.writeUInt16LE(0x0000, 0);
  cmdField.writeUInt16LE(0x0100, 2);
  cmdField.writeUInt32LE(2, 4);
  cmdField.writeUInt16LE(0x8001, 8);
  cmdBufs.push(cmdField);

  // (0000,0120) Message ID Being Responded To
  const msgIdElem = Buffer.alloc(10);
  msgIdElem.writeUInt16LE(0x0000, 0);
  msgIdElem.writeUInt16LE(0x0120, 2);
  msgIdElem.writeUInt32LE(2, 4);
  msgIdElem.writeUInt16LE(messageId, 8);
  cmdBufs.push(msgIdElem);

  // (0000,0800) Data Set Type: US 0x0101 (No dataset)
  const dsElem = Buffer.alloc(10);
  dsElem.writeUInt16LE(0x0000, 0);
  dsElem.writeUInt16LE(0x0800, 2);
  dsElem.writeUInt32LE(2, 4);
  dsElem.writeUInt16LE(0x0101, 8);
  cmdBufs.push(dsElem);

  // (0000,0900) Status: US status
  const statusElem = Buffer.alloc(10);
  statusElem.writeUInt16LE(0x0000, 0);
  statusElem.writeUInt16LE(0x0900, 2);
  statusElem.writeUInt32LE(2, 4);
  statusElem.writeUInt16LE(status, 8);
  cmdBufs.push(statusElem);

  if (affectedSopInstUid) {
    let instBuf = Buffer.from(affectedSopInstUid, 'ascii');
    if (instBuf.length % 2 !== 0) instBuf = Buffer.concat([instBuf, Buffer.from([0x00])]);
    const instElem = Buffer.alloc(8 + instBuf.length);
    instElem.writeUInt16LE(0x0000, 0);
    instElem.writeUInt16LE(0x1000, 2);
    instElem.writeUInt32LE(instBuf.length, 4);
    instBuf.copy(instElem, 8);
    cmdBufs.push(instElem);
  }

  const rawCmd = Buffer.concat(cmdBufs);
  const fullCmd = Buffer.alloc(12 + rawCmd.length);
  fullCmd.writeUInt16LE(0x0000, 0);
  fullCmd.writeUInt16LE(0x0000, 2);
  fullCmd.writeUInt32LE(4, 4);
  fullCmd.writeUInt32LE(rawCmd.length, 8);
  rawCmd.copy(fullCmd, 12);

  const pDataBuf = Buffer.alloc(6 + 4 + 2 + fullCmd.length);
  pDataBuf[0] = PDU_P_DATA_TF;
  pDataBuf[1] = 0x00;
  pDataBuf.writeUInt32BE(4 + 2 + fullCmd.length, 2);
  pDataBuf.writeUInt32BE(2 + fullCmd.length, 6);
  pDataBuf[10] = pcId;
  pDataBuf[11] = 0x03;
  fullCmd.copy(pDataBuf, 12);

  return pDataBuf;
}

/**
 * Builds A-RELEASE-RQ PDU
 */
function buildReleaseRq() {
  const buf = Buffer.alloc(10);
  buf[0] = PDU_A_RELEASE_RQ;
  buf[1] = 0x00;
  buf.writeUInt32BE(4, 2);
  buf.writeUInt32BE(0, 6);
  return buf;
}

/**
 * Builds A-RELEASE-RP PDU
 */
function buildReleaseRp() {
  const buf = Buffer.alloc(10);
  buf[0] = PDU_A_RELEASE_RP;
  buf[1] = 0x00;
  buf.writeUInt32BE(4, 2);
  buf.writeUInt32BE(0, 6);
  return buf;
}

/**
 * Converts raw DICOM dataset to a fully valid DICOM Part 10 buffer
 */
function makeDicomPart10Buffer(rawDatasetBuf, sopClassUid = '', sopInstUid = '', transferSyntax = TS_EXPLICIT_VR_LE) {
  if (rawDatasetBuf.length >= 132) {
    const magic = String.fromCharCode(rawDatasetBuf[128], rawDatasetBuf[129], rawDatasetBuf[130], rawDatasetBuf[131]);
    if (magic === 'DICM') return rawDatasetBuf;
  }

  const metaElems = [];

  // (0002,0001) FileMetaInformationVersion OB 2 bytes [0x00, 0x01]
  metaElems.push(Buffer.from([
    0x02, 0x00, 0x01, 0x00, 0x4F, 0x42, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x00, 0x01
  ]));

  // (0002,0002) MediaStorageSOPClassUID UI
  const sopClass = sopClassUid || '1.2.840.10008.5.1.4.1.1.2';
  let sopClassBuf = Buffer.from(sopClass, 'ascii');
  if (sopClassBuf.length % 2 !== 0) sopClassBuf = Buffer.concat([sopClassBuf, Buffer.from([0x00])]);
  const sopClassElem = Buffer.alloc(8 + sopClassBuf.length);
  sopClassElem.writeUInt16LE(0x0002, 0);
  sopClassElem.writeUInt16LE(0x0002, 2);
  sopClassElem.write('UI', 4, 'ascii');
  sopClassElem.writeUInt16LE(sopClassBuf.length, 6);
  sopClassBuf.copy(sopClassElem, 8);
  metaElems.push(sopClassElem);

  // (0002,0003) MediaStorageSOPInstanceUID UI
  const sopInst = sopInstUid || `1.2.826.0.1.3680043.9.${Date.now()}`;
  let sopInstBuf = Buffer.from(sopInst, 'ascii');
  if (sopInstBuf.length % 2 !== 0) sopInstBuf = Buffer.concat([sopInstBuf, Buffer.from([0x00])]);
  const sopInstElem = Buffer.alloc(8 + sopInstBuf.length);
  sopInstElem.writeUInt16LE(0x0002, 0);
  sopInstElem.writeUInt16LE(0x0003, 2);
  sopInstElem.write('UI', 4, 'ascii');
  sopInstElem.writeUInt16LE(sopInstBuf.length, 6);
  sopInstBuf.copy(sopInstElem, 8);
  metaElems.push(sopInstElem);

  // (0002,0010) TransferSyntaxUID UI
  const ts = transferSyntax || TS_EXPLICIT_VR_LE;
  let tsBuf = Buffer.from(ts, 'ascii');
  if (tsBuf.length % 2 !== 0) tsBuf = Buffer.concat([tsBuf, Buffer.from([0x00])]);
  const tsElem = Buffer.alloc(8 + tsBuf.length);
  tsElem.writeUInt16LE(0x0002, 0);
  tsElem.writeUInt16LE(0x0010, 2);
  tsElem.write('UI', 4, 'ascii');
  tsElem.writeUInt16LE(tsBuf.length, 6);
  tsBuf.copy(tsElem, 8);
  metaElems.push(tsElem);

  // (0002,0012) ImplementationClassUID UI
  const impl = '1.2.826.0.1.3680043.9.7134.1.0';
  let implBuf = Buffer.from(impl, 'ascii');
  if (implBuf.length % 2 !== 0) implBuf = Buffer.concat([implBuf, Buffer.from([0x00])]);
  const implElem = Buffer.alloc(8 + implBuf.length);
  implElem.writeUInt16LE(0x0002, 0);
  implElem.writeUInt16LE(0x0012, 2);
  implElem.write('UI', 4, 'ascii');
  implElem.writeUInt16LE(implBuf.length, 6);
  implBuf.copy(implElem, 8);
  metaElems.push(implElem);

  const rawMetaContent = Buffer.concat(metaElems);

  // (0002,0000) FileMetaInformationGroupLength UL
  const groupLenElem = Buffer.alloc(12);
  groupLenElem.writeUInt16LE(0x0002, 0);
  groupLenElem.writeUInt16LE(0x0000, 2);
  groupLenElem.write('UL', 4, 'ascii');
  groupLenElem.writeUInt16LE(4, 6);
  groupLenElem.writeUInt32LE(rawMetaContent.length, 8);

  const fullMetaHeader = Buffer.concat([groupLenElem, rawMetaContent]);
  const preamble = Buffer.alloc(128, 0);
  const dicmPrefix = Buffer.from('DICM', 'ascii');

  return Buffer.concat([preamble, dicmPrefix, fullMetaHeader, rawDatasetBuf]);
}

/**
 * Executes a live DICOM C-ECHO (Ping) over standard TCP socket to PACS server
 */
function testDicomEcho(serverConfig) {
  return new Promise((resolve) => {
    const start = performance.now();
    const host = serverConfig.host || '127.0.0.1';
    const port = Number(serverConfig.port) || 104;
    const calledAe = serverConfig.aeTitle || 'INFOMED';
    const callingAe = serverConfig.callingAeTitle || 'RADIANT_VIEWER';

    const socket = new net.Socket();
    let state = 'CONNECTING';
    let echoSent = false;
    let timer = setTimeout(() => {
      socket.destroy();
      resolve({
        success: false,
        message: `Connection timeout (4000ms): Could not reach ${host}:${port}`,
        responseTimeMs: Math.round(performance.now() - start)
      });
    }, 4500);

    socket.connect(port, host, () => {
      state = 'ASSOCIATING';
      const pdu = buildAssociateRq(callingAe, calledAe, [
        {
          abstractSyntax: SOP_VERIFICATION,
          transferSyntaxes: [TS_IMPLICIT_VR_LE, TS_EXPLICIT_VR_LE]
        }
      ]);
      socket.write(pdu);
    });

    let incomingBuffer = Buffer.alloc(0);

    socket.on('data', (chunk) => {
      incomingBuffer = Buffer.concat([incomingBuffer, chunk]);

      if (incomingBuffer.length < 6) return;
      const pduType = incomingBuffer[0];
      const pduLen = incomingBuffer.readUInt32BE(2);

      if (incomingBuffer.length < 6 + pduLen) return;

      if (pduType === PDU_A_ASSOCIATE_AC && !echoSent) {
        state = 'ASSOCIATED';
        echoSent = true;
        const cEcho = buildCEchoRq(1, 1);
        socket.write(cEcho);
        incomingBuffer = incomingBuffer.slice(6 + pduLen);
      } else if (pduType === PDU_P_DATA_TF) {
        state = 'ECHO_RECEIVED';
        clearTimeout(timer);
        const time = Math.round(performance.now() - start);

        try {
          socket.write(buildReleaseRq());
        } catch (e) {}

        setTimeout(() => {
          socket.destroy();
          resolve({
            success: true,
            message: `C-ECHO Success! Connected to PACS [${calledAe}] at ${host}:${port} (${time} ms)`,
            responseTimeMs: time
          });
        }, 100);
      } else if (pduType === PDU_A_ASSOCIATE_RJ) {
        clearTimeout(timer);
        socket.destroy();
        resolve({
          success: false,
          message: `Association Rejected (A-ASSOCIATE-RJ) by Called AE '${calledAe}' at ${host}:${port}. Check AE Title.`,
          responseTimeMs: Math.round(performance.now() - start)
        });
      }
    });

    socket.on('error', (err) => {
      clearTimeout(timer);
      const time = Math.round(performance.now() - start);
      resolve({
        success: false,
        message: `Socket error (${host}:${port}): ${err.message}`,
        responseTimeMs: time
      });
    });
  });
}

/**
 * Builds C-FIND-RQ PDUs (Command Dataset + Identifier Dataset)
 */
function buildDicomStringElement(group, elem, val) {
  const strVal = String(val !== undefined && val !== null ? val : '').trim();
  let valBuf = Buffer.from(strVal, 'ascii');
  if (valBuf.length % 2 !== 0) {
    const isUid = (group === 0x0020 && (elem === 0x000D || elem === 0x000E)) || 
                  (group === 0x0008 && (elem === 0x0016 || elem === 0x0018 || elem === 0x0008));
    valBuf = Buffer.concat([valBuf, Buffer.from([isUid ? 0x00 : 0x20])]);
  }
  const elBuf = Buffer.alloc(8 + valBuf.length);
  elBuf.writeUInt16LE(group, 0);
  elBuf.writeUInt16LE(elem, 2);
  elBuf.writeUInt32LE(valBuf.length, 4);
  valBuf.copy(elBuf, 8);
  return elBuf;
}

function buildCFindRq(pcId, sopClassUid, filters = {}, messageId = 1) {
  const cmdBufs = [];

  const sop = sopClassUid || SOP_STUDY_ROOT_FIND;
  let sopBuf = Buffer.from(sop, 'ascii');
  if (sopBuf.length % 2 !== 0) {
    sopBuf = Buffer.concat([sopBuf, Buffer.from([0x00])]);
  }
  const sopElem = Buffer.alloc(8 + sopBuf.length);
  sopElem.writeUInt16LE(0x0000, 0);
  sopElem.writeUInt16LE(0x0002, 2);
  sopElem.writeUInt32LE(sopBuf.length, 4);
  sopBuf.copy(sopElem, 8);
  cmdBufs.push(sopElem);

  const cmdField = Buffer.alloc(10);
  cmdField.writeUInt16LE(0x0000, 0);
  cmdField.writeUInt16LE(0x0100, 2);
  cmdField.writeUInt32LE(2, 4);
  cmdField.writeUInt16LE(0x0020, 8);
  cmdBufs.push(cmdField);

  const msgIdElem = Buffer.alloc(10);
  msgIdElem.writeUInt16LE(0x0000, 0);
  msgIdElem.writeUInt16LE(0x0110, 2);
  msgIdElem.writeUInt32LE(2, 4);
  msgIdElem.writeUInt16LE(messageId, 8);
  cmdBufs.push(msgIdElem);

  const prioElem = Buffer.alloc(10);
  prioElem.writeUInt16LE(0x0000, 0);
  prioElem.writeUInt16LE(0x0700, 2);
  prioElem.writeUInt32LE(2, 4);
  prioElem.writeUInt16LE(0x0000, 8);
  cmdBufs.push(prioElem);

  const dsElem = Buffer.alloc(10);
  dsElem.writeUInt16LE(0x0000, 0);
  dsElem.writeUInt16LE(0x0800, 2);
  dsElem.writeUInt32LE(2, 4);
  dsElem.writeUInt16LE(0x0001, 8);
  cmdBufs.push(dsElem);

  const rawCmd = Buffer.concat(cmdBufs);
  const fullCmd = Buffer.alloc(12 + rawCmd.length);
  fullCmd.writeUInt16LE(0x0000, 0);
  fullCmd.writeUInt16LE(0x0000, 2);
  fullCmd.writeUInt32LE(4, 4);
  fullCmd.writeUInt32LE(rawCmd.length, 8);
  rawCmd.copy(fullCmd, 12);

  const cmdPdu = Buffer.alloc(6 + 4 + 2 + fullCmd.length);
  cmdPdu[0] = PDU_P_DATA_TF;
  cmdPdu[1] = 0x00;
  cmdPdu.writeUInt32BE(4 + 2 + fullCmd.length, 2);
  cmdPdu.writeUInt32BE(2 + fullCmd.length, 6);
  cmdPdu[10] = pcId;
  cmdPdu[11] = 0x03;
  fullCmd.copy(cmdPdu, 12);

  let patNameFilter = '';
  if (filters.patientName) {
    patNameFilter = filters.patientName.includes('*') ? filters.patientName : `*${filters.patientName}*`;
  }
  let patIdFilter = filters.patientId || '';
  let modalityFilter = filters.modality && filters.modality !== 'ALL' ? filters.modality : '';
  let accFilter = filters.accessionNumber || '';
  let dateFilter = filters.studyDate || '';
  if (!dateFilter && (filters.dateFrom || filters.dateTo)) {
    const dFrom = (filters.dateFrom || '').replace(/[^0-9]/g, '');
    const dTo = (filters.dateTo || '').replace(/[^0-9]/g, '');
    if (dFrom && dTo) {
      dateFilter = `${dFrom}-${dTo}`;
    } else if (dFrom) {
      dateFilter = `${dFrom}-${dFrom}`;
    } else if (dTo) {
      dateFilter = `${dTo}-${dTo}`;
    }
  } else if (dateFilter && !dateFilter.includes('-')) {
    dateFilter = `${dateFilter}-${dateFilter}`;
  }

  const dataElems = [
    buildDicomStringElement(0x0008, 0x0052, 'STUDY'),
    buildDicomStringElement(0x0008, 0x0020, dateFilter),
    buildDicomStringElement(0x0008, 0x0030, ''),
    buildDicomStringElement(0x0008, 0x0050, accFilter),
    buildDicomStringElement(0x0008, 0x0060, modalityFilter),
    buildDicomStringElement(0x0008, 0x0061, modalityFilter),
    buildDicomStringElement(0x0008, 0x1030, ''),
    buildDicomStringElement(0x0010, 0x0010, patNameFilter),
    buildDicomStringElement(0x0010, 0x0020, patIdFilter),
    buildDicomStringElement(0x0010, 0x0030, ''),
    buildDicomStringElement(0x0010, 0x0040, ''),
    buildDicomStringElement(0x0020, 0x000D, ''),
    buildDicomStringElement(0x0020, 0x1206, ''),
    buildDicomStringElement(0x0020, 0x1208, '')
  ];

  const rawData = Buffer.concat(dataElems);
  const dataPdu = Buffer.alloc(6 + 4 + 2 + rawData.length);
  dataPdu[0] = PDU_P_DATA_TF;
  dataPdu[1] = 0x00;
  dataPdu.writeUInt32BE(4 + 2 + rawData.length, 2);
  dataPdu.writeUInt32BE(2 + rawData.length, 6);
  dataPdu[10] = pcId;
  dataPdu[11] = 0x02;
  rawData.copy(dataPdu, 12);

  return Buffer.concat([cmdPdu, dataPdu]);
}

/**
 * Builds C-MOVE-RQ PDU
 */
function buildCMoveRq(pcId, sopClassUid, studyInstanceUid, moveDestination, messageId = 1) {
  const cmdBufs = [];

  const sop = sopClassUid || SOP_STUDY_ROOT_MOVE;
  let sopBuf = Buffer.from(sop, 'ascii');
  if (sopBuf.length % 2 !== 0) sopBuf = Buffer.concat([sopBuf, Buffer.from([0x00])]);
  const sopElem = Buffer.alloc(8 + sopBuf.length);
  sopElem.writeUInt16LE(0x0000, 0);
  sopElem.writeUInt16LE(0x0002, 2);
  sopElem.writeUInt32LE(sopBuf.length, 4);
  sopBuf.copy(sopElem, 8);
  cmdBufs.push(sopElem);

  // (0000,0100) Command Field: US 0x0021 (C-MOVE-RQ)
  const cmdField = Buffer.alloc(10);
  cmdField.writeUInt16LE(0x0000, 0);
  cmdField.writeUInt16LE(0x0100, 2);
  cmdField.writeUInt32LE(2, 4);
  cmdField.writeUInt16LE(0x0021, 8);
  cmdBufs.push(cmdField);

  // (0000,0110) Message ID
  const msgIdElem = Buffer.alloc(10);
  msgIdElem.writeUInt16LE(0x0000, 0);
  msgIdElem.writeUInt16LE(0x0110, 2);
  msgIdElem.writeUInt32LE(2, 4);
  msgIdElem.writeUInt16LE(messageId, 8);
  cmdBufs.push(msgIdElem);

  // (0000,0600) Move Destination: AE moveDestination
  let destBuf = Buffer.from(moveDestination, 'ascii');
  if (destBuf.length % 2 !== 0) destBuf = Buffer.concat([destBuf, Buffer.from([0x20])]);
  const destElem = Buffer.alloc(8 + destBuf.length);
  destElem.writeUInt16LE(0x0000, 0);
  destElem.writeUInt16LE(0x0600, 2);
  destElem.writeUInt32LE(destBuf.length, 4);
  destBuf.copy(destElem, 8);
  cmdBufs.push(destElem);

  // (0000,0700) Priority: US 0x0000 (Medium)
  const prioElem = Buffer.alloc(10);
  prioElem.writeUInt16LE(0x0000, 0);
  prioElem.writeUInt16LE(0x0700, 2);
  prioElem.writeUInt32LE(2, 4);
  prioElem.writeUInt16LE(0x0000, 8);
  cmdBufs.push(prioElem);

  // (0000,0800) Data Set Type: US 0x0001 (Dataset Present)
  const dsElem = Buffer.alloc(10);
  dsElem.writeUInt16LE(0x0000, 0);
  dsElem.writeUInt16LE(0x0800, 2);
  dsElem.writeUInt32LE(2, 4);
  dsElem.writeUInt16LE(0x0001, 8);
  cmdBufs.push(dsElem);

  const rawCmd = Buffer.concat(cmdBufs);
  const fullCmd = Buffer.alloc(12 + rawCmd.length);
  fullCmd.writeUInt16LE(0x0000, 0);
  fullCmd.writeUInt16LE(0x0000, 2);
  fullCmd.writeUInt32LE(4, 4);
  fullCmd.writeUInt32LE(rawCmd.length, 8);
  rawCmd.copy(fullCmd, 12);

  const cmdPdu = Buffer.alloc(6 + 4 + 2 + fullCmd.length);
  cmdPdu[0] = PDU_P_DATA_TF;
  cmdPdu[1] = 0x00;
  cmdPdu.writeUInt32BE(4 + 2 + fullCmd.length, 2);
  cmdPdu.writeUInt32BE(2 + fullCmd.length, 6);
  cmdPdu[10] = pcId;
  cmdPdu[11] = 0x03;
  fullCmd.copy(cmdPdu, 12);

  // 2. Query Dataset
  const dataElems = [
    buildDicomStringElement(0x0008, 0x0052, 'STUDY'),
    buildDicomStringElement(0x0020, 0x000D, studyInstanceUid)
  ];
  const rawData = Buffer.concat(dataElems);
  const dataPdu = Buffer.alloc(6 + 4 + 2 + rawData.length);
  dataPdu[0] = PDU_P_DATA_TF;
  dataPdu[1] = 0x00;
  dataPdu.writeUInt32BE(4 + 2 + rawData.length, 2);
  dataPdu.writeUInt32BE(2 + rawData.length, 6);
  dataPdu[10] = pcId;
  dataPdu[11] = 0x02;
  rawData.copy(dataPdu, 12);
  return Buffer.concat([cmdPdu, dataPdu]);
}

/**
 * Builds C-FIND-RQ PDU for Series Discovery under a Study
 */
function buildCFindSeriesRq(pcId, sopClassUid, studyInstanceUid, messageId = 1) {
  const cmdBufs = [];
  const sop = sopClassUid || SOP_STUDY_ROOT_FIND;
  let sopBuf = Buffer.from(sop, 'ascii');
  if (sopBuf.length % 2 !== 0) sopBuf = Buffer.concat([sopBuf, Buffer.from([0x00])]);
  const sopElem = Buffer.alloc(8 + sopBuf.length);
  sopElem.writeUInt16LE(0x0000, 0);
  sopElem.writeUInt16LE(0x0002, 2);
  sopElem.writeUInt32LE(sopBuf.length, 4);
  sopBuf.copy(sopElem, 8);
  cmdBufs.push(sopElem);

  const cmdField = Buffer.alloc(10);
  cmdField.writeUInt16LE(0x0000, 0);
  cmdField.writeUInt16LE(0x0100, 2);
  cmdField.writeUInt32LE(2, 4);
  cmdField.writeUInt16LE(0x0020, 8); // C-FIND-RQ
  cmdBufs.push(cmdField);

  const msgIdElem = Buffer.alloc(10);
  msgIdElem.writeUInt16LE(0x0000, 0);
  msgIdElem.writeUInt16LE(0x0110, 2);
  msgIdElem.writeUInt32LE(2, 4);
  msgIdElem.writeUInt16LE(messageId, 8);
  cmdBufs.push(msgIdElem);

  const prioElem = Buffer.alloc(10);
  prioElem.writeUInt16LE(0x0000, 0);
  prioElem.writeUInt16LE(0x0700, 2);
  prioElem.writeUInt32LE(2, 4);
  prioElem.writeUInt16LE(0, 8);
  cmdBufs.push(prioElem);

  const dsElem = Buffer.alloc(10);
  dsElem.writeUInt16LE(0x0000, 0);
  dsElem.writeUInt16LE(0x0800, 2);
  dsElem.writeUInt32LE(2, 4);
  dsElem.writeUInt16LE(1, 8);
  cmdBufs.push(dsElem);

  const rawCmd = Buffer.concat(cmdBufs);
  const fullCmd = Buffer.alloc(12 + rawCmd.length);
  fullCmd.writeUInt16LE(0x0000, 0);
  fullCmd.writeUInt16LE(0x0000, 2);
  fullCmd.writeUInt32LE(4, 4);
  fullCmd.writeUInt32LE(rawCmd.length, 8);
  rawCmd.copy(fullCmd, 12);

  const cmdPdu = Buffer.alloc(6 + 4 + 2 + fullCmd.length);
  cmdPdu[0] = PDU_P_DATA_TF;
  cmdPdu[1] = 0x00;
  cmdPdu.writeUInt32BE(4 + 2 + fullCmd.length, 2);
  cmdPdu.writeUInt32BE(2 + fullCmd.length, 6);
  cmdPdu[10] = pcId;
  cmdPdu[11] = 0x03;
  fullCmd.copy(cmdPdu, 12);

  const dataElems = [
    buildDicomStringElement(0x0008, 0x0052, 'SERIES'),
    buildDicomStringElement(0x0020, 0x000D, studyInstanceUid),
    buildDicomStringElement(0x0020, 0x000E, ''),
    buildDicomStringElement(0x0020, 0x0011, ''),
    buildDicomStringElement(0x0008, 0x103E, ''),
    buildDicomStringElement(0x0008, 0x0060, ''),
    buildDicomStringElement(0x0020, 0x1209, '')
  ];

  const rawData = Buffer.concat(dataElems);
  const dataPdu = Buffer.alloc(6 + 4 + 2 + rawData.length);
  dataPdu[0] = PDU_P_DATA_TF;
  dataPdu[1] = 0x00;
  dataPdu.writeUInt32BE(4 + 2 + rawData.length, 2);
  dataPdu.writeUInt32BE(2 + rawData.length, 6);
  dataPdu[10] = pcId;
  dataPdu[11] = 0x02;
  rawData.copy(dataPdu, 12);

  return Buffer.concat([cmdPdu, dataPdu]);
}

/**
 * Queries the list of series available in a study on PACS
 */
function querySeriesInStudy(serverConfig, studyInstanceUid) {
  return new Promise((resolve) => {
    const host = serverConfig.host || '127.0.0.1';
    const port = Number(serverConfig.port) || 104;
    const calledAe = serverConfig.aeTitle || 'INFOMED';
    const callingAe = serverConfig.callingAeTitle || 'RADIANT_VIEWER';

    const socket = new net.Socket();
    socket.setNoDelay(true);
    const seriesList = [];

    const timer = setTimeout(() => {
      try { socket.destroy(); } catch (e) {}
      resolve(seriesList);
    }, 4500);

    socket.connect(port, host, () => {
      const pdu = buildAssociateRq(callingAe, calledAe, [
        { abstractSyntax: SOP_STUDY_ROOT_FIND, transferSyntaxes: [TS_IMPLICIT_VR_LE, TS_EXPLICIT_VR_LE] }
      ]);
      socket.write(pdu);
    });

    let clientBuffer = Buffer.alloc(0);
    let currentFragments = [];

    socket.on('data', (chunk) => {
      clientBuffer = Buffer.concat([clientBuffer, chunk]);
      while (clientBuffer.length >= 6) {
        const pduType = clientBuffer[0];
        const pduLen = clientBuffer.readUInt32BE(2);
        if (clientBuffer.length < 6 + pduLen) break;
        const pduPayload = clientBuffer.slice(6, 6 + pduLen);
        clientBuffer = clientBuffer.slice(6 + pduLen);

        if (pduType === PDU_A_ASSOCIATE_AC) {
          const findPdu = buildCFindSeriesRq(1, SOP_STUDY_ROOT_FIND, studyInstanceUid, 1);
          socket.write(findPdu);
        } else if (pduType === PDU_P_DATA_TF) {
          let off = 0;
          while (off + 6 <= pduPayload.length) {
            const pdvLen = pduPayload.readUInt32BE(off);
            const controlHeader = pduPayload[off + 5];
            const isCommand = (controlHeader & 0x01) === 0x01;
            const isLast = (controlHeader & 0x02) === 0x02;
            const pdvData = pduPayload.slice(off + 6, off + 4 + pdvLen);
            off += 4 + pdvLen;

            if (isCommand) {
              const cmdMap = parseDicomDataset(pdvData);
              const status = cmdMap['(0000,0900)'];
              if (status === 0x0000) {
                clearTimeout(timer);
                try { socket.write(buildReleaseRq()); } catch (e) {}
                setTimeout(() => { socket.destroy(); resolve(seriesList); }, 50);
                return;
              }
            } else {
              currentFragments.push(pdvData);
              if (isLast) {
                const full = Buffer.concat(currentFragments);
                currentFragments = [];
                const parsed = parseDicomDataset(full);
                const uid = parsed['(0020,000E)'];
                if (uid && !seriesList.some(s => s.seriesUid === uid)) {
                  seriesList.push({
                    seriesUid: uid,
                    seriesNumber: parsed['(0020,0011)'],
                    seriesDescription: parsed['(0008,103E)'],
                    modality: parsed['(0008,0060)'],
                    instances: parseInt(parsed['(0020,1209)'] || '0', 10)
                  });
                }
              }
            }
          }
        }
      }
    });

    socket.on('error', () => { clearTimeout(timer); resolve(seriesList); });
  });
}

/**
 * Builds C-GET-RQ PDU (Supports both STUDY level and SERIES level)
 */
function buildCGetRq(pcId, sopClassUid, studyInstanceUid, seriesInstanceUid = '', messageId = 1) {
  const cmdBufs = [];

  const sop = sopClassUid || SOP_STUDY_ROOT_GET;
  let sopBuf = Buffer.from(sop, 'ascii');
  if (sopBuf.length % 2 !== 0) sopBuf = Buffer.concat([sopBuf, Buffer.from([0x00])]);
  const sopElem = Buffer.alloc(8 + sopBuf.length);
  sopElem.writeUInt16LE(0x0000, 0);
  sopElem.writeUInt16LE(0x0002, 2);
  sopElem.writeUInt32LE(sopBuf.length, 4);
  sopBuf.copy(sopElem, 8);
  cmdBufs.push(sopElem);

  // (0000,0100) Command Field: US 0x0010 (C-GET-RQ)
  const cmdField = Buffer.alloc(10);
  cmdField.writeUInt16LE(0x0000, 0);
  cmdField.writeUInt16LE(0x0100, 2);
  cmdField.writeUInt32LE(2, 4);
  cmdField.writeUInt16LE(0x0010, 8);
  cmdBufs.push(cmdField);

  // (0000,0110) Message ID
  const msgIdElem = Buffer.alloc(10);
  msgIdElem.writeUInt16LE(0x0000, 0);
  msgIdElem.writeUInt16LE(0x0110, 2);
  msgIdElem.writeUInt32LE(2, 4);
  msgIdElem.writeUInt16LE(messageId, 8);
  cmdBufs.push(msgIdElem);

  // (0000,0700) Priority: US 0x0000 (Medium)
  const prioElem = Buffer.alloc(10);
  prioElem.writeUInt16LE(0x0000, 0);
  prioElem.writeUInt16LE(0x0700, 2);
  prioElem.writeUInt32LE(2, 4);
  prioElem.writeUInt16LE(0x0000, 8);
  cmdBufs.push(prioElem);

  // (0000,0800) Data Set Type: US 0x0001 (Dataset Present)
  const dsElem = Buffer.alloc(10);
  dsElem.writeUInt16LE(0x0000, 0);
  dsElem.writeUInt16LE(0x0800, 2);
  dsElem.writeUInt32LE(2, 4);
  dsElem.writeUInt16LE(0x0001, 8);
  cmdBufs.push(dsElem);

  const rawCmd = Buffer.concat(cmdBufs);
  const fullCmd = Buffer.alloc(12 + rawCmd.length);
  fullCmd.writeUInt16LE(0x0000, 0);
  fullCmd.writeUInt16LE(0x0000, 2);
  fullCmd.writeUInt32LE(4, 4);
  fullCmd.writeUInt32LE(rawCmd.length, 8);
  rawCmd.copy(fullCmd, 12);

  const cmdPdu = Buffer.alloc(6 + 4 + 2 + fullCmd.length);
  cmdPdu[0] = PDU_P_DATA_TF;
  cmdPdu[1] = 0x00;
  cmdPdu.writeUInt32BE(4 + 2 + fullCmd.length, 2);
  cmdPdu.writeUInt32BE(2 + fullCmd.length, 6);
  cmdPdu[10] = pcId;
  cmdPdu[11] = 0x03;
  fullCmd.copy(cmdPdu, 12);

  const dataElems = seriesInstanceUid ? [
    buildDicomStringElement(0x0008, 0x0052, 'SERIES'),
    buildDicomStringElement(0x0020, 0x000D, studyInstanceUid),
    buildDicomStringElement(0x0020, 0x000E, seriesInstanceUid)
  ] : [
    buildDicomStringElement(0x0008, 0x0052, 'STUDY'),
    buildDicomStringElement(0x0020, 0x000D, studyInstanceUid)
  ];

  const rawData = Buffer.concat(dataElems);
  const dataPdu = Buffer.alloc(6 + 4 + 2 + rawData.length);
  dataPdu[0] = PDU_P_DATA_TF;
  dataPdu[1] = 0x00;
  dataPdu.writeUInt32BE(4 + 2 + rawData.length, 2);
  dataPdu.writeUInt32BE(2 + rawData.length, 6);
  dataPdu[10] = pcId;
  dataPdu[11] = 0x02;
  rawData.copy(dataPdu, 12);

  return Buffer.concat([cmdPdu, dataPdu]);
}

/**
 * Parses raw DICOM dataset buffer (Implicit or Explicit VR Little Endian) into key-value map
 */
function parseDicomDataset(buf) {
  const result = {};
  let offset = 0;

  while (offset + 8 <= buf.length) {
    const group = buf.readUInt16LE(offset);
    const elem = buf.readUInt16LE(offset + 2);
    offset += 4;

    const tagKey = `(${group.toString(16).padStart(4, '0')},${elem.toString(16).padStart(4, '0')})`.toUpperCase();

    let vr = null;
    let length = 0;

    if (offset + 4 <= buf.length) {
      const b0 = buf[offset];
      const b1 = buf[offset + 1];
      if (b0 >= 65 && b0 <= 90 && b1 >= 65 && b1 <= 90) {
        vr = String.fromCharCode(b0, b1);
        offset += 2;
        if (['OB', 'OW', 'OF', 'SQ', 'UC', 'UR', 'UT', 'UN'].includes(vr)) {
          offset += 2; // Reserved
          if (offset + 4 <= buf.length) {
            length = buf.readUInt32LE(offset);
            offset += 4;
          }
        } else {
          length = buf.readUInt16LE(offset);
          offset += 2;
        }
      } else {
        length = buf.readUInt32LE(offset);
        offset += 4;
      }
    }

    if (length === 0xFFFFFFFF || length < 0 || offset + length > buf.length) {
      break;
    }

    const valBuf = buf.slice(offset, offset + length);
    offset += length;

    if (group === 0x0000) {
      if (elem === 0x0002 || elem === 0x0003 || elem === 0x1000) {
        result[tagKey] = valBuf.toString('ascii').replace(/\0+$/, '').trim();
      } else if (length === 2) {
        result[tagKey] = valBuf.readUInt16LE(0);
      } else if (length === 4) {
        result[tagKey] = valBuf.readUInt32LE(0);
      } else {
        result[tagKey] = valBuf.toString('latin1').replace(/\0+$/, '').trim();
      }
    } else {
      let strVal = valBuf.toString('latin1').replace(/\0+$/, '').trim();
      result[tagKey] = strVal;
    }
  }

  return result;
}

/**
 * Executes a live DICOM C-FIND query over TCP socket to PACS server
 */
function searchDicomStudies(serverConfig, filters = {}) {
  return new Promise((resolve) => {
    const host = serverConfig.host || '127.0.0.1';
    const port = Number(serverConfig.port) || 104;
    const calledAe = serverConfig.aeTitle || 'INFOMED';
    const callingAe = serverConfig.callingAeTitle || 'RADIANT_VIEWER';

    const socket = new net.Socket();
    let querySent = false;
    let acceptedPcId = 1;
    let acceptedSop = SOP_STUDY_ROOT_FIND;
    const studies = [];

    function finalizeResults() {
      let res = studies;
      const dFrom = (filters.dateFrom || '').replace(/[^0-9]/g, '');
      const dTo = (filters.dateTo || '').replace(/[^0-9]/g, '');
      if (dFrom || dTo) {
        res = res.filter(s => {
          if (!s.studyDate) return true;
          if (dFrom && s.studyDate < dFrom) return false;
          if (dTo && s.studyDate > dTo) return false;
          return true;
        });
      }
      return res;
    }

    let timer = setTimeout(() => {
      socket.destroy();
      console.warn(`PACS C-FIND timeout from ${host}:${port}. Returning ${studies.length} studies.`);
      resolve(finalizeResults());
    }, 10000);

    socket.connect(port, host, () => {
      const pdu = buildAssociateRq(callingAe, calledAe, [
        {
          abstractSyntax: SOP_STUDY_ROOT_FIND,
          transferSyntaxes: [TS_IMPLICIT_VR_LE, TS_EXPLICIT_VR_LE]
        },
        {
          abstractSyntax: SOP_PATIENT_ROOT_FIND,
          transferSyntaxes: [TS_IMPLICIT_VR_LE, TS_EXPLICIT_VR_LE]
        },
        {
          abstractSyntax: SOP_VERIFICATION,
          transferSyntaxes: [TS_IMPLICIT_VR_LE, TS_EXPLICIT_VR_LE]
        }
      ]);
      socket.write(pdu);
    });

    let incomingBuffer = Buffer.alloc(0);
    let currentDataFragments = [];

    socket.on('data', (chunk) => {
      incomingBuffer = Buffer.concat([incomingBuffer, chunk]);

      while (incomingBuffer.length >= 6) {
        const pduType = incomingBuffer[0];
        const pduLen = incomingBuffer.readUInt32BE(2);

        if (incomingBuffer.length < 6 + pduLen) break;

        const pduPayload = incomingBuffer.slice(6, 6 + pduLen);
        incomingBuffer = incomingBuffer.slice(6 + pduLen);

        if (pduType === PDU_A_ASSOCIATE_AC && !querySent) {
          querySent = true;
          const cFindPdu = buildCFindRq(acceptedPcId, acceptedSop, filters, 1);
          socket.write(cFindPdu);
        } else if (pduType === PDU_P_DATA_TF) {
          let offset = 0;
          while (offset + 6 <= pduPayload.length) {
            const pdvLen = pduPayload.readUInt32BE(offset);
            const controlHeader = pduPayload[offset + 5];
            const isCommand = (controlHeader & 0x01) === 0x01;
            const isLast = (controlHeader & 0x02) === 0x02;
            const pdvData = pduPayload.slice(offset + 6, offset + 4 + pdvLen);
            offset += 4 + pdvLen;

            if (isCommand) {
              const cmdMap = parseDicomDataset(pdvData);
              const statusFromMap = cmdMap['(0000,0900)'];
              let statusNum = (typeof statusFromMap === 'number') ? statusFromMap : 0xFFFF;
              if (statusNum === 0xFFFF && pdvData.length >= 10) {
                for (let i = 0; i <= pdvData.length - 8; i += 2) {
                  const g = pdvData.readUInt16LE(i);
                  const e = pdvData.readUInt16LE(i + 2);
                  if (g === 0x0000 && e === 0x0900) {
                    const l = pdvData.readUInt32LE(i + 4);
                    if (l === 2) {
                      statusNum = pdvData.readUInt16LE(i + 8);
                    }
                    break;
                  }
                }
              }

              if (statusNum === 0x0000 || statusNum === 0) {
                clearTimeout(timer);
                try { socket.write(buildReleaseRq()); } catch (e) {}
                socket.destroy();
                resolve(finalizeResults());
                return;
              }
            } else {
              currentDataFragments.push(pdvData);
              if (isLast) {
                const fullDataBuf = Buffer.concat(currentDataFragments);
                currentDataFragments = [];
                const parsed = parseDicomDataset(fullDataBuf);

                const rawPatName = (parsed['(0010,0010)'] || '').replace(/\^/g, ' ').trim();
                const patientId = parsed['(0010,0020)'] || 'Unknown ID';
                const patientName = rawPatName || (patientId !== 'Unknown ID' ? `Patient (${patientId})` : 'Anonymous');
                const studyInstanceUid = parsed['(0020,000D)'] || `study_${Math.random()}`;
                const studyDate = parsed['(0008,0020)'] || '';
                const studyTime = parsed['(0008,0030)'] || '';
                const rawMod = (parsed['(0008,0061)'] || parsed['(0008,0060)'] || '').toUpperCase().trim();
                const studyDescription = parsed['(0008,1030)'] || '';
                const descUpper = studyDescription.toUpperCase();

                let modalities = rawMod;
                if (!modalities) {
                  if (descUpper.includes('CT') || descUpper.includes('TOMOGRAPHY') || descUpper.includes('CHEST') || descUpper.includes('BRAIN') || descUpper.includes('ABDOMEN') || descUpper.includes('PELVIS')) {
                    modalities = 'CT';
                  } else if (descUpper.includes('MR') || descUpper.includes('MRI') || descUpper.includes('SPINE') || descUpper.includes('MAGNETIC')) {
                    modalities = 'MR';
                  } else if (descUpper.includes('US') || descUpper.includes('ULTRASOUND') || descUpper.includes('ECHO') || descUpper.includes('SONO')) {
                    modalities = 'US';
                  } else if (descUpper.includes('DX') || descUpper.includes('CR') || descUpper.includes('XR') || descUpper.includes('X-RAY') || descUpper.includes('RADIOGRAPH')) {
                    modalities = 'DX';
                  } else {
                    modalities = 'CT';
                  }
                }

                let numberOfInstances = parseInt(parsed['(0020,1209)'] || parsed['(0020,1208)'] || parsed['(0020,1206)'] || '0', 10);

                const rawSeriesDesc = parsed['(0008,103E)'] || '';
                const finalDesc = studyDescription 
                  ? (rawSeriesDesc && !studyDescription.includes(rawSeriesDesc) ? `${studyDescription} [${rawSeriesDesc}]` : studyDescription)
                  : (rawSeriesDesc || `${modalities} Examination`);

                const accessionNumber = parsed['(0008,0050)'] || '';
                const patientSex = parsed['(0010,0040)'] || 'O';
                const patientBirthDate = parsed['(0010,0030)'] || '';

                if (studyInstanceUid && !studies.some(s => s.studyInstanceUid === studyInstanceUid)) {
                  studies.push({
                    patientId,
                    patientName,
                    patientSex,
                    patientBirthDate,
                    studyInstanceUid,
                    studyDate,
                    studyTime,
                    studyDescription: finalDesc,
                    accessionNumber,
                    modalities,
                    numberOfInstances,
                    serverConfigId: serverConfig.id
                  });
                }
              }
            }
          }
        } else if (pduType === PDU_A_ASSOCIATE_RJ || pduType === PDU_A_ABORT) {
          clearTimeout(timer);
          socket.destroy();
          resolve(finalizeResults());
        }
      }
    });

    socket.on('error', (err) => {
      clearTimeout(timer);
      console.warn('C-FIND Socket error:', err.message);
      resolve(finalizeResults());
    });

    socket.on('close', () => {
      clearTimeout(timer);
      resolve(finalizeResults());
    });
  });
}

/**
 * Worker function to retrieve a single DICOM series over an independent high-speed TCP socket
 */
function retrieveSingleSeriesWorker(serverConfig, studyInstanceUid, seriesUid, onSliceFile) {
  return new Promise((resolve) => {
    const host = serverConfig.host || '127.0.0.1';
    const port = Number(serverConfig.port) || 104;
    const calledAe = serverConfig.aeTitle || 'INFOMED';
    const callingAe = serverConfig.callingAeTitle || 'RADIANT_VIEWER';

    const socket = new net.Socket();
    socket.setNoDelay(true);
    socket.setKeepAlive(true, 1000);

    const received = [];
    let isFinished = false;

    const cleanup = () => {
      if (isFinished) return;
      isFinished = true;
      try { socket.destroy(); } catch (e) {}
      resolve(received);
    };

    let timer = setTimeout(cleanup, 5000);

    const presentationContexts = [
      { id: 1, abstractSyntax: '1.2.840.10008.5.1.4.1.2.2.2', transferSyntaxes: [TS_IMPLICIT_VR_LE, TS_EXPLICIT_VR_LE] },
      { id: 3, abstractSyntax: SOP_STUDY_ROOT_GET, transferSyntaxes: [TS_IMPLICIT_VR_LE, TS_EXPLICIT_VR_LE] }
    ];

    STORAGE_SOP_CLASSES.forEach((sop, i) => {
      presentationContexts.push({
        id: 5 + (i * 2),
        abstractSyntax: sop,
        transferSyntaxes: [
          TS_EXPLICIT_VR_LE,
          TS_IMPLICIT_VR_LE,
          '1.2.840.10008.1.2.4.70',
          '1.2.840.10008.1.2.4.90',
          '1.2.840.10008.1.2.4.80',
          '1.2.840.10008.1.2.5'
        ]
      });
    });

    socket.connect(port, host, () => {
      const pdu = buildAssociateRq(callingAe, calledAe, presentationContexts);
      socket.write(pdu);
    });

    let clientBuffer = Buffer.alloc(0);
    let currentCGetCmd = { msgId: 1 };
    let cGetActiveFragments = [];

    socket.on('data', (chunk) => {
      clientBuffer = Buffer.concat([clientBuffer, chunk]);

      while (clientBuffer.length >= 6) {
        const pduType = clientBuffer[0];
        const pduLen = clientBuffer.readUInt32BE(2);
        if (clientBuffer.length < 6 + pduLen) break;
        const pduPayload = clientBuffer.slice(6, 6 + pduLen);
        clientBuffer = clientBuffer.slice(6 + pduLen);

        if (pduType === PDU_A_ASSOCIATE_AC) {
          const cGetPdu = buildCGetRq(3, SOP_STUDY_ROOT_GET, studyInstanceUid, seriesUid, 1);
          socket.write(cGetPdu);
        } else if (pduType === PDU_P_DATA_TF) {
          let off = 0;
          while (off + 6 <= pduPayload.length) {
            const pdvLen = pduPayload.readUInt32BE(off);
            const pdvPcId = pduPayload[off + 4];
            const controlHeader = pduPayload[off + 5];
            const isCommand = (controlHeader & 0x01) === 0x01;
            const isLast = (controlHeader & 0x02) === 0x02;
            const pdvData = pduPayload.slice(off + 6, off + 4 + pdvLen);
            off += 4 + pdvLen;

            if (isCommand) {
              const cmdMap = parseDicomDataset(pdvData);
              const cmdField = cmdMap['(0000,0100)'];
              const status = cmdMap['(0000,0900)'];
              if (cmdField === 1 || cmdField === 0x0001) {
                currentCGetCmd = {
                  msgId: cmdMap['(0000,0110)'] || 1,
                  sopClass: cmdMap['(0000,0002)'] || '',
                  sopInstance: cmdMap['(0000,1000)'] || ''
                };
              }
              if (status === 0x0000 || (cmdField === 0x8010 && (status === 0x0000 || status === 0xB000))) {
                clearTimeout(timer);
                try { socket.write(buildReleaseRq()); } catch (e) {}
                setTimeout(cleanup, 10);
                return;
              }
            } else {
              cGetActiveFragments.push(pdvData);
              if (isLast) {
                const fullBuf = Buffer.concat(cGetActiveFragments);
                cGetActiveFragments = [];
                const p10Buf = makeDicomPart10Buffer(fullBuf, currentCGetCmd.sopClass, currentCGetCmd.sopInstance);
                const fileObj = {
                  fileName: `${currentCGetCmd.sopInstance || `inst_${received.length + 1}`}.dcm`,
                  buffer: p10Buf.toString('base64'),
                  size: p10Buf.length,
                  index: received.length + 1
                };
                received.push(fileObj);
                if (typeof onSliceFile === 'function') {
                  try { onSliceFile(fileObj); } catch (e) {}
                }
                clearTimeout(timer);
                timer = setTimeout(cleanup, 800);

                const rspPdu = buildCStoreRsp(pdvPcId, currentCGetCmd.msgId || 1, 0x0000, currentCGetCmd.sopClass, currentCGetCmd.sopInstance);
                socket.write(rspPdu);
              }
            }
          }
        } else if (pduType === PDU_A_ASSOCIATE_RJ || pduType === PDU_A_ABORT || pduType === PDU_A_RELEASE_RP) {
          cleanup();
        }
      }
    });

    socket.on('error', cleanup);
    socket.on('close', cleanup);
  });
}

/**
 * Retrieves full real DICOM studies via Parallel Multi-Channel DICOM Acceleration (RadiAnt Architecture)
 */
async function retrieveDicomStudy(serverConfig, studyInstanceUid, onSlice) {
  const host = serverConfig.host || '127.0.0.1';
  const port = Number(serverConfig.port) || 104;
  const calledAe = serverConfig.aeTitle || 'INFOMED';
  const callingAe = serverConfig.callingAeTitle || 'RADIANT_VIEWER';

  // 1. Discover all series under this study
  let seriesList = [];
  try {
    seriesList = await querySeriesInStudy(serverConfig, studyInstanceUid);
    console.log(`[PACS Series Discovery] Found ${seriesList.length} series in study ${studyInstanceUid}`);
  } catch (e) {
    console.warn('[PACS Series Discovery] Failed to query series list:', e);
  }

  // Filter out dose, protocol, raw reconstruction, and non-image series
  const imageSeries = seriesList.filter(s => {
    const desc = (s.seriesDescription || '').toLowerCase();
    const mod = (s.modality || '').toUpperCase();
    if (mod === 'SR' || mod === 'PR' || mod === 'KO' || mod === 'DOC' || mod === 'OT') return false;
    if (desc.includes('raw data') || desc.includes('raw_data') || desc === 'raw') return false;
    if (desc.includes('patient protocol') || desc.includes('dose report') || desc.includes('dose info') || desc.includes('protocol')) return false;
    return true;
  });

  // De-duplicate series by seriesUid
  const uniqueMap = new Map();
  const rawList = imageSeries.length > 0 ? imageSeries : seriesList;
  for (const s of rawList) {
    if (s.seriesUid && !uniqueMap.has(s.seriesUid)) {
      uniqueMap.set(s.seriesUid, s);
    }
  }
  const targetSeriesList = Array.from(uniqueMap.values());

  // Prioritize primary volumetric series first (Axial > Coronal > Sagittal > Others)
  targetSeriesList.sort((a, b) => {
    const descA = (a.seriesDescription || '').toLowerCase();
    const descB = (b.seriesDescription || '').toLowerCase();
    const isAxialA = descA.includes('ax') ? 1 : 0;
    const isAxialB = descB.includes('ax') ? 1 : 0;
    if (isAxialA !== isAxialB) return isAxialB - isAxialA;
    return (b.instances || 0) - (a.instances || 0);
  });

  const allFiles = [];
  let sliceIndex = 0;

  const handleWorkerSlice = (fileObj) => {
    sliceIndex++;
    fileObj.index = sliceIndex;
    allFiles.push(fileObj);
    if (typeof onSlice === 'function') {
      try { onSlice(fileObj); } catch (e) {}
    }
  };

  if (targetSeriesList.length > 0) {
    // 2. High-Speed Multi-Channel Concurrent DICOM Pipeline (up to 8 Parallel Associations)
    const MAX_CONCURRENT_CHANNELS = 8;
    console.log(`[RadiAnt Turbo Pipeline] Launching ${Math.min(MAX_CONCURRENT_CHANNELS, targetSeriesList.length)} parallel DICOM associations for ${targetSeriesList.length} diagnostic series...`);

    const queue = [...targetSeriesList];
    const runWorkerPool = async () => {
      const workers = [];
      const numWorkers = Math.min(MAX_CONCURRENT_CHANNELS, targetSeriesList.length);
      for (let i = 0; i < numWorkers; i++) {
        workers.push((async () => {
          while (queue.length > 0) {
            const nextSer = queue.shift();
            if (!nextSer) break;
            console.log(`[Turbo Worker] Fetching Series: "${nextSer.seriesDescription || nextSer.seriesUid}"`);
            await retrieveSingleSeriesWorker(serverConfig, studyInstanceUid, nextSer.seriesUid, handleWorkerSlice);
          }
        })());
      }
      await Promise.all(workers);
    };

    await runWorkerPool();

    console.log(`[RadiAnt Turbo Pipeline] Finished! Total Slices Retrieved: ${allFiles.length}`);
    return {
      success: allFiles.length > 0,
      count: allFiles.length,
      files: allFiles
    };
  }

  // Fallback: Single socket STUDY level retrieve
  const singleResult = await retrieveSingleSeriesWorker(serverConfig, studyInstanceUid, '', handleWorkerSlice);
  return {
    success: singleResult.length > 0,
    count: singleResult.length,
    files: singleResult
  };
}

module.exports = {
  testDicomEcho,
  searchDicomStudies,
  retrieveDicomStudy,
  buildAssociateRq,
  buildAssociateAc,
  buildCEchoRq,
  buildCFindRq,
  buildCMoveRq,
  buildCGetRq,
  buildCStoreRsp,
  buildReleaseRq,
  buildReleaseRp,
  makeDicomPart10Buffer,
  parseDicomDataset,
  SOP_VERIFICATION,
  SOP_STUDY_ROOT_FIND,
  SOP_PATIENT_ROOT_FIND,
  SOP_STUDY_ROOT_MOVE,
  SOP_STUDY_ROOT_GET,
  STORAGE_SOP_CLASSES
};

