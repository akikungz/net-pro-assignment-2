import flask, netmiko, asyncio
from flask import jsonify, request, jsonify
from pysnmp.hlapi.v3arch.asyncio import *

app = flask.Flask(__name__, static_folder='static', static_url_path='/')

# set template folder
app.template_folder = 'template'

hosts = {
    "R1": {
        "host": "192.168.0.44",
        "username": "cisco",
        "password": "cisco",
        "type": "router",
    },
    "SW1": {
        "host": "192.168.0.34",
        "username": "cisco",
        "password": "cisco",
        "type": "multilayer switch",
    }
}

@app.route('/')
def index():
    # render the index.html template
    return flask.render_template('index.html')

@app.route('/api/hosts', methods=["GET"])
def get_hosts():
    # return the hosts dictionary keys
    return flask.jsonify({ "data": list(hosts.keys()) })

@app.route('/api/<host>/ips', methods=["GET"])
def get_ips(host):
    # get the host details
    host = hosts.get(host)
    if not host:
        return flask.jsonify({ "error": "Host not found" })

    # connect to the host
    conn = netmiko.ConnectHandler(
        device_type="cisco_ios",
        host=host["host"],
        username=host["username"],
        password=host["password"],
    )

    # get the interfaces
    output = conn.send_command("show ip int brief")
    conn.disconnect()

    # return the interfaces
    return flask.jsonify({ "data": output.split("\n")[1:] })

@app.route('/api/<host>/ips/<interface>', methods=["GET", "POST", "PATCH", "PUT"])
def ips(host, interface):
    # get parameters
    params = flask.request.args
    
    print(params)
    
    # get the host details
    host = hosts.get(host)
    if not host:
        return flask.jsonify({ "error": "Host not found" })

    # interface: str = interface.replace("p", "/")
    # print(interface)

    # connect to the host
    conn = netmiko.ConnectHandler(
        device_type="cisco_ios",
        host=host["host"],
        username=host["username"],
        password=host["password"],
    )

    # check method
    if flask.request.method == "GET":
        # get the interface details
        output = conn.send_command(f"show ip interface {interface}")
    elif flask.request.method == "POST":
        interface = interface.replace('p', '/')
        body = flask.request.json
        # enable the interface
        if host["type"] == "multilayer switch":
            output = conn.send_config_set([f"interface {interface.replace('p', '/')}", "no switchport"])
        
        output = conn.send_config_set([f"interface {interface.replace('p', '/')}", f"ip addr {body['ip']} {body['mask']}", "no shutdown"])
        pass
    elif flask.request.method == "PATCH":
        # check if the interface is shutdown or not
        output = conn.send_command(f"show ip interface {interface}")
        if "administratively down" in output:
            output = conn.send_config_set(["conf t", f"interface {interface}", "no shutdown"])
        else:
            output = conn.send_config_set(["conf t", f"interface {interface}", "shutdown"])

    conn.disconnect()

    # return the output
    print(output)
    return flask.jsonify({ "data": output })

@app.route('/api/<host>/routes', methods=["GET", "POST", "DELETE"])
def routes(host):
    host = hosts.get(host)
    
    if not host:
        return flask.jsonify({ "error": "Host not found" })
    
    conn = netmiko.ConnectHandler(
        device_type="cisco_ios",
        host=host["host"],
        username=host["username"],
        password=host["password"],
    )
    
    if flask.request.method == "GET":
        output = conn.send_command("show ip route")
    elif flask.request.method == "POST":
        body = flask.request.json
        output = conn.send_config_set([f"ip route {body['network']} {body['mask']} {body['nextHop']}"])
    elif flask.request.method == "DELETE":
        body = flask.request.json
        output = conn.send_config_set([f"no ip route {body['network']} {body['mask']} {body['nextHop']}"])
    
    conn.disconnect()
    
    return flask.jsonify({ "data": output })

@app.route('/api/<host>/vlans', methods=["GET", "POST", "PUT", "DELETE"])
def vlans(host):
    host = hosts.get(host)
    
    if not host:
        return flask.jsonify({ "error": "Host not found" })
    elif host["type"] == "router":
        return flask.jsonify({ "error": "VLANs are not supported on routers" })
    
    conn = netmiko.ConnectHandler(
        device_type="cisco_ios",
        host=host["host"],
        username=host["username"],
        password=host["password"],
    )
    
    if flask.request.method == "GET":
        output = conn.send_command("show vlan brief")
    elif flask.request.method == "POST":
        body = flask.request.json
        output = conn.send_config_set([f"vlan {body['id']}", f"name {body['name']}"])
    elif flask.request.method == "PUT":
        body = flask.request.json
        output = conn.send_config_set([f"vlan {body['id']}", f"name {body['name']}"])
    elif flask.request.method == "DELETE":
        body = flask.request.json
        output = conn.send_config_set([f"no vlan {body['id']}"])
    
    conn.disconnect()
    
    return flask.jsonify({ "data": output })

@app.route('/api/<host>/switchport', methods=["PUT"])
def switchport(host):
    host = hosts.get(host)
    
    if not host:
        return flask.jsonify({ "error": "Host not found" })
    elif host["type"] == "router":
        return flask.jsonify({ "error": "Switchport is not supported on routers" })
    
    conn = netmiko.ConnectHandler(
        device_type="cisco_ios",
        host=host["host"],
        username=host["username"],
        password=host["password"],
    )
    
    body = flask.request.json
    if body["mode"] == "access":
        output = conn.send_config_set([f"interface {body['interface']}", f"switchport access vlan {body['vlan']}"])
    elif body["mode"] == "trunk":
        output = conn.send_config_set([f"interface {body['interface']}", f"switchport mode trunk"])
    
    conn.disconnect()
    
    return flask.jsonify({ "data": output })

@app.route('/snmp/control/<host>/<community>/<port>', methods=['POST'])
async def control_port(host, community, port):
    oid_ifAdminStatus = f'1.3.6.1.2.1.2.2.1.7.{port}'  # OID สำหรับ ifAdminStatus
    status = request.json.get('status')
    if status is None:
        return jsonify({"error": "Status not provided"}), 400
    
    if host not in hosts:
        return jsonify({"error": "Host not found"}), 400
    
    ip = hosts[host]['host']

    # กำหนดสถานะใหม่เป็น 1 (ขึ้น) หรือ 2 (ลง)
    new_status = 1 if status == 'up' else 2  # 1 for up, 2 for down

    # ส่งคำสั่ง SNMP SET
    errorIndication, errorStatus, errorIndex, varBinds = await set_cmd(
        SnmpEngine(),
        CommunityData(community),
        await UdpTransportTarget.create((ip, 161)),
        ContextData(),
        ObjectType(ObjectIdentity(oid_ifAdminStatus), Integer(new_status))
    )

    if errorIndication:
        print(f"Error Indication: {errorIndication}")
        return jsonify({"error": str(errorIndication)}), 400
    elif errorStatus:
        print(f"Error Status: {errorStatus.prettyPrint()} at {errorIndex}")
        return jsonify({"error": str(errorStatus.prettyPrint())}), 400
    else:
        print(f"Successfully set port {port} to {'up' if new_status == 1 else 'down'}")

    return jsonify({"message": "Port status updated successfully."})

@app.route('/snmp/ports/<host>/<community>', methods=['GET'])
async def get_ports(host, community):
    oid_ifTable = '1.3.6.1.2.1.2.2.1.7'  # OID สำหรับ ifAdminStatus ของทุกพอร์ต
    oid_ifDescr = '1.3.6.1.2.1.2.2.1.2'  # OID สำหรับ ifDescr (ชื่อพอร์ต)
    
    if host not in hosts:
        return jsonify({"error": "Host not found"}), 400
    
    ip = hosts[host]['host']

    errorIndication, errorStatus, errorIndex, varBinds_admin = await bulk_cmd(
        SnmpEngine(),
        CommunityData(community),
        await UdpTransportTarget.create((ip, 161)),
        ContextData(),
        0,  # Non-repeaters
        10,  # Max-repetitions
        ObjectType(ObjectIdentity(oid_ifTable))
    )

    errorIndication_descr, errorStatus_descr, errorIndex_descr, varBinds_descr = await bulk_cmd(
        SnmpEngine(),
        CommunityData(community),
        await UdpTransportTarget.create((ip, 161)),
        ContextData(),
        0,  # Non-repeaters
        10,  # Max-repetitions
        ObjectType(ObjectIdentity(oid_ifDescr))
    )

    if errorIndication:
        return jsonify({"error": str(errorIndication)}), 400
    elif errorStatus:
        return jsonify({"error": str(errorStatus.prettyPrint())}), 400
    elif errorIndication_descr:
        return jsonify({"error": str(errorIndication_descr)}), 400
    elif errorStatus_descr:
        return jsonify({"error": str(errorStatus_descr.prettyPrint())}), 400
    else:
        results = {}
        # Create a mapping for port names
        port_names = {}
        for name, value in varBinds_descr:
            port_index = str(name).split('.')[-1]  # ดึงหมายเลขพอร์ต
            port_names[port_index] = str(value)  # เก็บชื่อพอร์ต

        for name, value in varBinds_admin:
            port_index = str(name).split('.')[-1]  # ดึงหมายเลขพอร์ต
            results[port_index] = {
                "status": str(value),  # เก็บสถานะพอร์ต
                "name": port_names.get(port_index, "Unknown Port")  # เก็บชื่อพอร์ต
            }

        return jsonify(results)  # ส่งกลับข้อมูลสถานะพอร์ต

@app.route('/snmp/device-name/<host>/<community>', methods=['GET'])
async def get_device_name(host, community):
    oid_sysName = '1.3.6.1.2.1.1.5.0'  # OID for sysName (device name)
    
    if host not in hosts:
        return jsonify({"error": "Host not found"}), 400
    
    ip = hosts[host]['host']
    
    errorIndication, errorStatus, errorIndex, varBinds = await get_cmd(
        SnmpEngine(),
        CommunityData(community),
        await UdpTransportTarget.create((ip, 161)),
        ContextData(),
        ObjectType(ObjectIdentity(oid_sysName))
    )

    if errorIndication:
        return jsonify({"error": str(errorIndication)}), 400
    elif errorStatus:
        return jsonify({"error": str(errorStatus.prettyPrint())}), 400
    else:
        device_name = str(varBinds[0][1])
        return jsonify({"device_name": device_name})

if __name__ == '__main__':
    app.run(debug=True)