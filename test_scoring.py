from app.scoring import BASE, DIFFICULTY

def test_base_values_match_spec():
    assert BASE == {"explore":10,"create":20,"test":20,"share":15,"connect":10,"enable":10}

def test_difficulty_values_match_spec():
    assert DIFFICULTY == {"easy":1.0,"moderate":1.5,"hard":2.0}

def test_decay_sequence():
    vals=[max(.2,.7**(n-1)) for n in range(1,8)]
    assert [round(x,2) for x in vals] == [1,.7,.49,.34,.24,.2,.2]
