// فئة للتعامل مع Web Bluetooth API
class BluetoothManager {
    constructor() {
        this.device = null;
        this.server = null;
        this.characteristics = new Map();
        this.isConnected = false;
    }

    // البحث عن الأجهزة
    async scanDevices() {
        try {
            this.addLog('🔍 بدء البحث عن أجهزة BLE...', 'system');
            
            const device = await navigator.bluetooth.requestDevice({
                acceptAllDevices: true,
                optionalServices: [
                    'generic_access',
                    'generic_attribute',
                    '180a', // Device Information Service
                    '180f', // Battery Service
                ]
            });

            return device;
        } catch (error) {
            if (error.name === 'NotFoundError') {
                this.addLog('❌ لم يتم اختيار أي جهاز', 'error');
            } else if (error.name !== 'NotAllowedError') {
                this.addLog(`❌ خطأ: ${error.message}`, 'error');
            }
            throw error;
        }
    }

    // الاتصال بالجهاز
    async connectDevice(device) {
        try {
            this.addLog(`⏳ الاتصال بـ ${device.name || 'جهاز غير معروف'}...`, 'system');
            
            this.device = device;
            this.server = await device.gatt.connect();
            this.isConnected = true;

            this.addLog(`✅ تم الاتصال بنجاح بـ ${device.name}`, 'system');
            
            // استخراج الخدمات والخصائص
            await this.discoverServices();
            
            // إضافة مستمع لقطع الاتصال
            device.addEventListener('gattserverdisconnected', () => {
                this.handleDisconnect();
            });

            return true;
        } catch (error) {
            this.addLog(`❌ خطأ الاتصال: ${error.message}`, 'error');
            this.isConnected = false;
            throw error;
        }
    }

    // اكتشاف الخدمات والخصائص
    async discoverServices() {
        try {
            this.addLog('🔎 اكتشاف الخدمات...', 'system');
            
            const services = await this.server.getPrimaryServices();
            
            for (const service of services) {
                try {
                    const characteristics = await service.getCharacteristics();
                    
                    for (const characteristic of characteristics) {
                        this.characteristics.set(
                            characteristic.uuid,
                            characteristic
                        );

                        // الاستماع للقراءات
                        if (characteristic.properties.notify) {
                            await characteristic.startNotifications();
                            characteristic.addEventListener(
                                'characteristicvaluechanged',
                                (e) => this.handleCharacteristicChange(e)
                            );
                        }
                    }
                } catch (error) {
                    console.log(`تجاهل الخدمة: ${error.message}`);
                }
            }

            this.addLog(`✅ تم اكتشاف ${this.characteristics.size} خصيصة`, 'system');
        } catch (error) {
            this.addLog(`⚠️ خطأ في الاكتشاف: ${error.message}`, 'error');
        }
    }

    // معالجة تغيير القيمة
    handleCharacteristicChange(event) {
        const value = event.target.value;
        const data = this.bufferToString(value);
        this.addLog(`📥 تم استقبال: ${data}`, 'received');
    }

    // إرسال البيانات
    async sendData(data) {
        try {
            if (!this.isConnected || !this.device) {
                throw new Error('لا يوجد اتصال نشط');
            }

            // محاولة الكتابة على الخصيصة الأولى
            for (const [uuid, characteristic] of this.characteristics) {
                if (characteristic.properties.write || characteristic.properties.writeWithoutResponse) {
                    const encoded = new TextEncoder().encode(data);
                    
                    if (characteristic.properties.writeWithoutResponse) {
                        await characteristic.writeValueWithoutResponse(encoded);
                    } else {
                        await characteristic.writeValue(encoded);
                    }

                    this.addLog(`📤 تم الإرسال: ${data}`, 'sent');
                    return true;
                }
            }

            throw new Error('لا توجد خصيصة للكتابة متاحة');
        } catch (error) {
            this.addLog(`❌ خطأ الإرسال: ${error.message}`, 'error');
            throw error;
        }
    }

    // قطع الاتصال
    async disconnect() {
        try {
            if (this.device) {
                await this.device.gatt.disconnect();
                this.addLog('👋 تم قطع الاتصال', 'system');
            }
        } catch (error) {
            this.addLog(`❌ خطأ في قطع الاتصال: ${error.message}`, 'error');
        }
    }

    // معالجة قطع ا��اتصال غير المتوقع
    handleDisconnect() {
        this.isConnected = false;
        this.device = null;
        this.server = null;
        this.characteristics.clear();
        this.addLog('⚠️ تم قطع الاتصال بالجهاز', 'error');
        updateUIState();
    }

    // تحويل Buffer إلى نص
    bufferToString(buffer) {
        return new TextDecoder().decode(buffer);
    }

    // إضافة رسالة للسجل
    addLog(message, type = 'system') {
        const logElement = document.getElementById('messageLog');
        const messageElement = document.createElement('p');
        messageElement.className = `log-message ${type}`;
        messageElement.textContent = `[${new Date().toLocaleTimeString('ar-SA')}] ${message}`;
        logElement.appendChild(messageElement);
        logElement.scrollTop = logElement.scrollHeight;
    }
}

// إنشاء مثيل من BluetoothManager
const bluetoothManager = new BluetoothManager();
let discoveredDevices = [];

// ربط الأحداث
document.getElementById('scanBtn').addEventListener('click', handleScan);
document.getElementById('disconnectBtn').addEventListener('click', handleDisconnect);
document.getElementById('sendBtn').addEventListener('click', handleSend);
document.getElementById('clearLogBtn').addEventListener('click', clearLog);
document.getElementById('dataInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleSend();
});

// معالج البحث
async function handleScan() {
    try {
        const device = await bluetoothManager.scanDevices();
        discoveredDevices.push(device);
        await bluetoothManager.connectDevice(device);
        updateUIState();
    } catch (error) {
        console.error('خطأ في المسح:', error);
    }
}

// معالج قطع الاتصال
async function handleDisconnect() {
    await bluetoothManager.disconnect();
    updateUIState();
}

// معالج الإرسال
async function handleSend() {
    const input = document.getElementById('dataInput');
    const data = input.value.trim();

    if (!data) return;

    try {
        await bluetoothManager.sendData(data);
        input.value = '';
    } catch (error) {
        console.error('خطأ الإرسال:', error);
    }
}

// مسح السجل
function clearLog() {
    const logElement = document.getElementById('messageLog');
    logElement.innerHTML = '<p class="log-message system">تم مسح السجل</p>';
}

// تحديث حالة واجهة المستخدم
function updateUIState() {
    const isConnected = bluetoothManager.isConnected;
    
    // تحديث الأزرار
    document.getElementById('scanBtn').disabled = isConnected;
    document.getElementById('disconnectBtn').disabled = !isConnected;
    document.getElementById('dataInput').disabled = !isConnected;
    document.getElementById('sendBtn').disabled = !isConnected;

    // تحديث حالة الاتصال
    const statusElement = document.getElementById('connectionStatus');
    if (isConnected) {
        statusElement.textContent = '✅ متصل';
        statusElement.className = 'status-connected';
        document.getElementById('connectedDevice').textContent = 
            bluetoothManager.device?.name || 'جهاز غير معروف';
        document.getElementById('deviceAddress').textContent = 
            bluetoothManager.device?.id || '-';
    } else {
        statusElement.textContent = '❌ غير متصل';
        statusElement.className = 'status-disconnected';
        document.getElementById('connectedDevice').textContent = '-';
        document.getElementById('deviceAddress').textContent = '-';
    }

    // تحديث قائمة الأجهزة
    updateDeviceList();
}

// تحديث قائمة الأجهزة
function updateDeviceList() {
    const listElement = document.getElementById('deviceList');
    
    if (discoveredDevices.length === 0) {
        listElement.innerHTML = '<p class="empty-message">لم يتم اكتشاف أي أجهزة بعد...</p>';
        return;
    }

    listElement.innerHTML = discoveredDevices.map((device, index) => `
        <div class="device-item" onclick="connectToDevice(${index})">
            <div class="device-info">
                <div class="device-name">📱 ${device.name || 'جهاز غير معروف'}</div>
                <div class="device-id">ID: ${device.id}</div>
            </div>
            <div class="device-rssi">${device.connected ? '✅ متصل' : '⏳ متوفر'}</div>
        </div>
    `).join('');
}

// الاتصال بجهاز محدد
async function connectToDevice(index) {
    try {
        const device = discoveredDevices[index];
        if (device.connected) {
            bluetoothManager.addLog('الجهاز متصل بالفعل', 'system');
            return;
        }
        await bluetoothManager.connectDevice(device);
        updateUIState();
    } catch (error) {
        console.error('خطأ الاتصال:', error);
    }
}

// التحقق من دعم Web Bluetooth
document.addEventListener('DOMContentLoaded', () => {
    if (!navigator.bluetooth) {
        bluetoothManager.addLog(
            '⚠️ المتصفح الحالي لا يدعم Web Bluetooth API',
            'error'
        );
        document.getElementById('scanBtn').disabled = true;
        document.getElementById('scanBtn').title = 'Web Bluetooth غير مدعوم';
    } else {
        bluetoothManager.addLog(
            '✅ Web Bluetooth جاهز للاستخدام',
            'system'
        );
    }
});

// تحديث حالة الواجهة عند التحميل
updateUIState();