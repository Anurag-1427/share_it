import 'react-native-get-random-values';
import { createContext, FC, useCallback, useContext, useState } from "react";
import { useChunkStore } from "../db/chunkStore";
import TcpSocket from 'react-native-tcp-socket';
import DeviceInfo from "react-native-device-info";
import { Buffer } from 'buffer';
import { Alert, Platform } from "react-native";
import RNFS from 'react-native-fs';
import { v4 as uuidv4 } from 'uuid';
import { produce } from 'immer';
import { receiveChunkAck, receivedFileAck, sendChunkAck } from './TCPUtils';

interface TCPContextType {
    server: any; // File receiver
    client: any; // File sender
    isConnected: boolean;
    connectedDevice: any;
    sentFiles: any;
    receivedFiles: any;
    totalSentBytes: number;
    totalReceivedBytes: number;
    startServer: (port: number) => void;
    connectToServer: (host: string, port: number, deviceName: string) => void;
    sentMessage: (message: string | Buffer) => void;
    sentFileAck: (file: any, type: 'file' | 'image') => void;
    disconnect: () => void;
}

const TCPContext = createContext<TCPContextType | undefined>(undefined);

export const useTCP = (): TCPContextType => {
    const context = useContext(TCPContext);
    if (!context)
        throw new Error("useTCP must be used within a TCPProvider");
    return context;
}

const options = {
    keystore: require('../../tls_certs/server-keystore.p12')
}

export const TCPProvider: FC<{ children: React.ReactNode }> = ({ children }) => {
    const [server, setServer] = useState<any>(null);
    const [client, setClient] = useState<any>(null);
    const [isConnected, setIsConnected] = useState<boolean>(false);
    const [connectedDevice, setConnectedDevice] = useState<any>(null);
    const [serverSocket, setServerSocket] = useState<any>(null);
    const [sentFiles, setSentFiles] = useState<any>([]);
    const [receivedFiles, setReceivedFiles] = useState<any>([]);
    const [totalSentBytes, setTotalSentBytes] = useState<number>(0);
    const [totalReceivedBytes, setTotalReceivedBytes] = useState<number>(0);

    const { currentChunkSet, setCurrentChunkSet, setChunkStore } = useChunkStore();

    // Start Server
    const startServer = useCallback((port: number) => {
        if (server) {
            console.log(`Server already running`);
            return;
        }
        const newServer = TcpSocket.createTLSServer(options, (socket) => {
            console.log(`Client Connected: `, socket.address());
            setServerSocket(socket);
            socket.setNoDelay(true);
            socket.readableHighWaterMark = 1024 * 1024 * 1;
            socket.writableHighWaterMark = 1024 * 1024 * 1;

            socket.on('data', async (data) => {
                const parsedData = JSON.parse(data?.toString());
                if (parsedData?.event === 'connect') {
                    setIsConnected(true);
                    setConnectedDevice(parsedData?.deviceName);
                }
                if (parsedData?.event === 'file_ack') {
                    receivedFileAck(parsedData?.file, socket, setReceivedFiles)
                }
                if (parsedData?.event === 'send_chunk_ack') {
                    sendChunkAck(parsedData?.chunkNo, socket, setTotalSentBytes, setSentFiles);
                }
                if (parsedData?.event === 'receive_chunk_ack') {
                    receiveChunkAck(parsedData?.chunk, parsedData?.chunkNo, socket, setTotalReceivedBytes, generateFile);
                }
            })

            socket.on('close', () => {
                console.log(`Client disconnected!`);
                setReceivedFiles([]);
                setSentFiles([]);
                setCurrentChunkSet(null);
                setTotalReceivedBytes(0);
                setChunkStore(null);
                setIsConnected(false);
                disconnect();
            })

            socket.on('error', (err) => {
                console.error(`Socket error: `, err);
            })
        })

        newServer.listen({ port, host: '0.0.0.0' }, () => {
            const address = newServer.address();
            console.log(`Server running on ${address?.address}: ${address?.port}`);
        })

        newServer.on('error', (err) => console.error(`Server error`, err));
        setServer(newServer);


    }, [server]);

    // Start Client
    const connectToServer = useCallback((host: string, port: number, deviceName: string) => {
        const newClient = TcpSocket.connectTLS({
            host, port, cert: true, ca: require('../../tls_certs/server-cert.pem')
        },
            () => {
                setIsConnected(true);
                setConnectedDevice(deviceName);
                const myDeviceName = DeviceInfo.getDeviceNameSync();
                newClient.write(JSON.stringify({ event: 'connect', deviceName: myDeviceName }));
            })

        newClient.setNoDelay(true);
        newClient.readableHighWaterMark = 1024 * 1024 * 1;
        newClient.writableHighWaterMark = 1024 * 1024 * 1;

        newClient.on('data', async (data) => {
            const parsedData = JSON.parse(data?.toString());

            if (parsedData?.event === 'file_ack') {
                receivedFileAck(parsedData?.file, newClient, setReceivedFiles)
            }
            if (parsedData?.event === 'send_chunk_ack') {
                sendChunkAck(parsedData?.chunkNo, newClient, setTotalSentBytes, setSentFiles);
            }
            if (parsedData?.event === 'receive_chunk_ack') {
                receiveChunkAck(parsedData?.chunk, parsedData?.chunkNo, newClient, setTotalReceivedBytes, generateFile)
            }
        })
        newClient.on('close', () => {
            console.log(`Connection closed!`);
            setReceivedFiles([]);
            setSentFiles([]);
            setCurrentChunkSet(null);
            setTotalReceivedBytes(0);
            setChunkStore(null);
            setIsConnected(false);
            disconnect();
        })

        newClient.on('error', (err) => {
            console.error(`Client error: `, err);
        })
        setClient(newClient);
    }, [client]);

    // Disconnect
    const disconnect = useCallback(() => {
        if (client) {
            client.destroy();
        }
        if (server) {
            server.close();
        }
        setReceivedFiles([]);
        setSentFiles([]);
        setCurrentChunkSet(null);
        setTotalReceivedBytes(0);
        setChunkStore(null);
        setIsConnected(false);
    }, [client, server]);

    // Send Message
    const sentMessage = useCallback((message: string | Buffer) => {
        if (client) {
            client.write(JSON.stringify(message));
            console.log(`Sent from Client: `, message);
        }
        else if (server) {
            serverSocket.write(JSON.stringify(message));
            console.log(`Sent from Server: `, message);
        }
        else {
            console.error(`No Client or Server Socket Available`);
        }
    }, [client, server]);

    // Send File Acknowledge
    const sendFileAck = async (file: any, type: 'image' | 'file') => {
        if (currentChunkSet != null) {
            Alert.alert(`Wait for current file to be sent!`);
        }
        const normalisedPath = Platform.OS === 'ios' ? file?.uri?.replace('file://', "") : file?.uri;
        const fileData = await RNFS.readFile(normalisedPath, 'base64'); // because base64 prevent data loss
        const buffer = Buffer.from(fileData, 'base64');
        const CHUNK_SIZE = 1024 * 8; // 8 bytes
        let totalChunks = 0;
        let offset = 0;
        let chunkArray = [];

        while (offset < buffer.length) {
            const chunk = buffer.slice(offset, offset + CHUNK_SIZE);
            totalChunks += 1;
            chunkArray.push(chunk);
            offset += chunk.length;
        }

        const rawData = {
            id: uuidv4(),
            name: type === 'file' ? file?.name : file?.fileName,
            size: type === 'file' ? file?.size : file?.fileSize,
            mimeType: type === 'file' ? 'file' : '.jpg',
            totalChunks
        };

        setCurrentChunkSet({
            id: rawData?.id,
            chunkArray,
            totalChunks
        })

        setSentFiles((prevData: any) => produce(prevData, (draft: any) => {
            draft.push({
                ...rawData,
                uri: file?.uri
            })
        }))

        const socket = client || serverSocket;
        if (!socket) return;
        try {
            console.log(`FILE ACKNOWLEDGE DONE ✅`);
            socket.write(JSON.stringify({ event: 'file_ack', file: rawData }));
        } catch (error) {
            console.error(`Error Sending File: `, error);
        }
    };

    // Generate File
    const generateFile = async () => {
        const { chunkStore, resetChunkStore } = useChunkStore?.getState();
        if (!chunkStore) {
            console.log("No Chunks or files to process");
        }
        if (chunkStore?.totalChunks !== chunkStore?.chunkArray.length) {
            console.error(`Not all chunks have been received.`)
        }

        try {
            const combinedChunks = Buffer.concat(chunkStore?.chunkArray);
            const platformPath = Platform.OS === 'ios' ? `${RNFS.DocumentDirectoryPath}` : `${RNFS.DownloadDirectoryPath}`;
            const filePath = `${platformPath}/${chunkStore?.name}`;

            await RNFS.writeFile(filePath, combinedChunks?.toString('base64'), 'base64');
            setReceivedFiles((prevFiles: any) =>
                produce(prevFiles, (draftFiles: any) => {
                    const fileIndex = draftFiles?.findIndex((f: any) => f.id === chunkStore.id)
                    if (fileIndex !== -1) {
                        draftFiles[fileIndex] = {
                            ...draftFiles[fileIndex],
                            uri: filePath,
                            available: true
                        }
                    }
                }))
            console.log(`FILE SAVED SUCCESSFULLY ✅ `, filePath);
            resetChunkStore();

        } catch (error) {
            console.error(`Error combining chunks or saving file: `, error);
        }
    }


    return (
        <TCPContext.Provider value={{
            server, client, isConnected, connectedDevice, sentFiles, receivedFiles, totalSentBytes, totalReceivedBytes, startServer, connectToServer, disconnect, sentMessage, sendFileAck
        }}>
            {children}
        </TCPContext.Provider>
    )
}