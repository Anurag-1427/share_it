import { Text, Modal, View, TouchableOpacity, ActivityIndicator } from 'react-native';
import React, { FC } from 'react';
import { modalStyles } from '../../styles/modalStyles';
import Icon from '../global/Icon';
import CustomText from '../global/CustomText';

interface ModalProps {
    visible: boolean;
    onClose: () => void;
}

const QRScannerModal: FC<ModalProps> = ({ visible, onClose }) => {
    return (
        <Modal
            animationType="slide"
            visible={visible}
            presentationStyle="formSheet"
            onRequestClose={onClose}
            onDismiss={onClose}>
            <View style={modalStyles.modalContainer}>
                <View style={modalStyles.qrContainer}>

                </View>
                <View style={modalStyles.info}>
                    <CustomText style={modalStyles.infoText1}>Ensure you're on the same Wi-Fi network.</CustomText>
                    <CustomText style={modalStyles.infoText2}>Ask the receiver to show QR code to connect and transfer files.</CustomText>
                </View>
                <ActivityIndicator size={'small'} color="#000" style={{ alignSelf: 'center' }} />
                <TouchableOpacity onPress={() => onClose()} style={modalStyles.closeButton}>
                    <Icon name="close" iconFamily='Ionicons' size={24} color="#000" />
                </TouchableOpacity>
            </View>
        </Modal>
    );
};

export default QRScannerModal;
