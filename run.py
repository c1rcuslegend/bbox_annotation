from app.factory import create_app

app = create_app()

if __name__ == "__main__":
    app.run(port=app.config['PORT_NUMBER'], debug=True)
