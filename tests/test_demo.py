import logging

from pokemon_battle.demo import main


def testLaDemonstrationTermineEtJournaliseLeCombat(capsys, caplog):
    """L'exemple traverse le service et SQLite avec un résultat reproductible."""
    with caplog.at_level(logging.DEBUG, logger="pokemon_battle"):
        main(["--seed", "42", "--debug"])
    assert capsys.readouterr().out.splitlines() == [
        "Bulbizarre contre Salamèche (graine 42)",
        "Tour 1 : Bulbizarre 73 PV | Salamèche 98 PV",
        "Tour 2 : Bulbizarre 24 PV | Salamèche 83 PV",
        "Tour 3 : Bulbizarre 0 PV | Salamèche 83 PV",
        "Vainqueur : Salamèche",
    ]
    messages = [record.getMessage() for record in caplog.records]
    assert sum(message.startswith("Tour enregistré") for message in messages) == 3
    assert any(message.startswith("Combat créé") for message in messages)
    assert any("AttackUsed(" in message for message in messages)
    assert any("KnockedOut(" in message for message in messages)
    assert any(message.startswith("Combat terminé") for message in messages)
