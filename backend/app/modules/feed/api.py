"""Module 5 facade. Other modules don't call the feed: they publish domain events and register() subscribes to them."""
from ...contracts.events import EventName
from ...platform import bus
from . import service


def register() -> None:
    for name in EventName.__args__:
        bus.subscribe(name, service.on_event)
