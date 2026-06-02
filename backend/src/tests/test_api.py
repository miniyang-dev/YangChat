def test_health(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_login_success(client):
    resp = client.post("/api/auth/login", json={"username": "admin", "password": "admin"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert "token" in data


def test_login_wrong_password(client):
    resp = client.post("/api/auth/login", json={"username": "admin", "password": "wrong"})
    data = resp.json()
    assert data["success"] is False


def test_list_conversations_requires_auth(client):
    resp = client.get("/api/conversations")
    assert resp.status_code == 401


def test_list_conversations(client, auth_token):
    resp = client.get("/api/conversations", headers={"Authorization": f"Bearer {auth_token}"})
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_create_and_delete_conversation(client, auth_token):
    headers = {"Authorization": f"Bearer {auth_token}"}
    # create
    resp = client.post("/api/conversations",
                       json={"model": "claude-sonnet-4-6", "first_message": "Hello"},
                       headers=headers)
    assert resp.status_code == 200
    conv_id = resp.json()["id"]

    # get
    resp = client.get(f"/api/conversations/{conv_id}", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["id"] == conv_id

    # delete
    resp = client.delete(f"/api/conversations/{conv_id}", headers=headers)
    assert resp.status_code == 200

    # verify deleted
    resp = client.get(f"/api/conversations/{conv_id}", headers=headers)
    assert resp.status_code == 404


def test_list_models(client, auth_token):
    resp = client.get("/api/models", headers={"Authorization": f"Bearer {auth_token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert len(data["data"]) > 0
