import flask
import netmiko

app = flask.Flask(__name__, static_folder='static', static_url_path='/')

# set template folder
app.template_folder = 'template'

hosts = {
    "R1": {
        "host": "192.168.56.102",
        "username": "cisco",
        "password": "cisco",
        "type": "router",
    },
    "SW1": {
        "host": "192.168.56.102",
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

@app.route('/api/<host>/ips/<interface>', methods=["GET", "POST", "PATCH"])
def ips(host, interface):
    # get parameters
    params = flask.request.args
    
    print(params)
    
    # get the host details
    host = hosts.get(host)
    if not host:
        return flask.jsonify({ "error": "Host not found" })

    interface = interface.replace("n", "/")
    print(interface)

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
        # enable the interface
        if host["type"] == "multilayer switch":
            output = conn.send_config_set([f"interface {interface}", "no switchport"])
        
        output = conn.send_config_set([f"interface {interface}", "no shutdown"])
        pass
    elif flask.request.method == "PATCH":
        # check if the interface is shutdown or not
        output = conn.send_command(f"show ip interface {interface}")
        if "administratively down" in output:
            output = conn.send_config_set([f"interface {interface}", "no shutdown"])
        else:
            output = conn.send_config_set([f"interface {interface}", "shutdown"])

    conn.disconnect()

    # return the output
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
        output = conn.send_config_set([f"ip route {body['network']} {body['mask']} {body['gateway']}"])
    elif flask.request.method == "DELETE":
        body = flask.request.json
        output = conn.send_config_set([f"no ip route {body['network']} {body['mask']} {body['gateway']}"])
    
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

if __name__ == '__main__':
    app.run()